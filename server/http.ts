import { incomingRaid } from "./twitch/raid.js";
import type { Versions } from "./versions/index.js";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { buildClient } from "./assets.js";
import type { SummonService } from "./summon/index.js";
import type { Rounds } from "./rounds/index.js";
import { WorldPipeline } from "./pipeline.js";

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(value));
}
async function body(request: IncomingMessage): Promise<unknown> {
  if (request.headers["content-type"]?.split(";")[0]?.trim() !== "application/json") throw new Error("Use application/json");
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0, exceeded = false;
    request.on("data", (chunk: Buffer) => {
      length += chunk.length;
      if (length > 8192) { exceeded = true; chunks.length = 0; reject(new Error("Request body exceeds 8 KiB")); }
      else if (!exceeded) chunks.push(chunk);
    });
    request.once("end", () => {
      if (exceeded) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(new Error("Invalid JSON")); }
    });
    request.once("error", () => reject(new Error("Request interrupted")));
    request.once("aborted", () => reject(new Error("Request interrupted")));
  });
}

async function post(request: IncomingMessage, response: ServerResponse, handler: (input: Record<string, unknown>) => Promise<{status:number;value:unknown;changed?:boolean}> | {status:number;value:unknown;changed?:boolean}, durable?: ()=>Promise<void>) {
  if (request.method !== "POST") { response.setHeader("Allow","POST"); request.resume(); json(response,405,{error:"Use POST"}); return; }
  try { const input=await body(request); if(!input||typeof input!=="object"||Array.isArray(input))throw new Error(); const result=await handler(input as Record<string,unknown>);if(result.changed)await durable?.();json(response,result.status,result.value); }
  catch {request.resume();if(!response.headersSent)json(response,400,{error:"Invalid JSON event or body; maximum 8 KiB, application/json required"});}
}

export async function createWorldServer(pipeline: WorldPipeline, summons?: SummonService, rounds?: Rounds, versions?: Versions, automation?: { durable?:()=>Promise<void>; broadcasterId?:string; simulationAllowed?: boolean; setOutcome?(outcome: string): void; live: boolean; fault(): Promise<void> }) {
  const assets = await buildClient();
  const pages = new Map([
    ["/world", await readFile(new URL("../world/index.html", import.meta.url))],
    ["/overlay", await readFile(new URL("../overlay/index.html", import.meta.url))],
    ["/history", await readFile(new URL("../world/history.html", import.meta.url))],
  ]);
  const clients = new Set<ServerResponse>();
  const worlds = new Map<string, ServerResponse>();
  const primary = (clientId: unknown) => typeof clientId === "string" && worlds.keys().next().value === clientId;
  const moduleFailures = new Set<string>();
  const server = createServer((request, response) => { void (async () => {
    response.on("error", () => response.destroy());
    response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'none'");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "no-store");
    const host = request.headers.host ?? "";
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) { json(response, 421, { error: "Local host required" }); return; }
    const url = new URL(request.url ?? "/", "http://localhost"), path = url.pathname;
    if (request.headers.origin && request.headers.origin !== `http://${host}`) { json(response, 403, { error: "Same origin required" }); return; }
    if ((path.startsWith("/sim/") || path === "/runner/live") && !automation?.simulationAllowed) { request.resume(); json(response, 403, { error: "Simulation routes are disabled" }); return; }
    if (["/runner/live","/modules/fault","/modules/ack","/summon/ack","/sim/round","/sim/chat","/sim/raid","/sim/eventsub"].includes(path)) {
      await post(request,response,async input=>{
        switch(path){
          case "/runner/live": {
            if(!automation?.live||!rounds||rounds.snapshot().phase!=="ideas"||rounds.snapshot().totalIdeas){return {status:409,value:{error:"Live runner requires a key and an empty round."}};}
            if(typeof input.idea!=="string")throw new Error();const round=rounds.snapshot().round;
            const result=pipeline.chat({id:`live-${Date.now()}`,userId:"live-bench",displayName:"LiveBench",color:"#E5C775",text:`!idea ${input.idea}`},{moderator:false,source:"sim"});
            if(!result.accepted){return {status:400,value:result};}rounds.skip();rounds.skip();return {status:200,value:{round}};
          }
          case "/modules/fault": {
            const current=versions?.current;
            if(!primary(input.clientId)||!current||input.version!==current.version||input.receipt!==current.receipt){return {status:409,value:{accepted:false}};}
            if(!moduleFailures.has(current.receipt)){moduleFailures.add(current.receipt);if(moduleFailures.size>128)moduleFailures.delete(moduleFailures.values().next().value!);void automation?.fault().catch(()=>{});}return {status:202,value:{accepted:true}};
          }
          case "/modules/ack": {
            const accepted=primary(input.clientId)&&typeof input.version==="number"&&typeof input.receipt==="string"&&typeof input.ok==="boolean"&&!!await versions?.acknowledge(input.version,input.receipt,input.ok);
            return {status:accepted?200:409,value:{accepted}};
          }
          case "/summon/ack": {
            const accepted=typeof input.id==="string"&&typeof input.receipt==="string"&&!!await summons?.acknowledge(input.id,input.receipt,typeof input.error==="string"?input.error:undefined,primary(input.clientId));
            return {status:accepted?200:409,value:{accepted},changed:accepted};
          }
          case "/sim/round": {
            if(typeof input.outcome!=="string"||!["ship","fail","timeout"].includes(input.outcome))throw new Error();
            automation?.setOutcome?.(input.outcome);
            const result=rounds?.startSimulation(input.outcome as "ship"|"fail"|"timeout")??{accepted:false,reason:"simulation-disabled"};
            return {status:result.accepted?200:result.reason==="simulation-disabled"?403:409,value:result};
          }
          case "/sim/chat": {const result=pipeline.chat(input,{moderator:false,source:"sim"});return {status:200,value:result};}
          case "/sim/eventsub": {const raid=incomingRaid(input,automation?.broadcasterId??"sim-broadcaster");const result=raid?pipeline.raid(raid):{accepted:false,reason:"not-incoming-raid"};return {status:200,value:result};}
          case "/sim/raid": {const result=pipeline.raid(input);return {status:200,value:result};}
        }
        throw new Error("Unknown event");
      },automation?.durable);return;
    }
    if (path.startsWith("/modules/") && path.endsWith(".js")) {
      if (request.method !== "GET") { json(response, 405, { error: "Use GET" }); return; }
      const code = versions?.bundle(path.slice(9, -3));
      if (!code) { json(response, 404, { error: "Unknown checked module" }); return; }
      response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" }).end(code); return;
    }
    if (path.startsWith("/api/summons/")) { const job=summons?.status(path.slice(13));json(response,job?200:404,job??{error:"Unknown summon"});return; }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end(); return;
    }
    if (path === "/api/rounds") { json(response, rounds ? 200 : 503, rounds?.snapshot() ?? { error: "Rounds unavailable" }); return; }
    if (path === "/api/history") { response.writeHead(200,{"Content-Type":"application/json; charset=utf-8"}).end(versions?.serializedHistory()??'{"versions":[]}');return; }
    if (path === "/api/world") { json(response, 200, pipeline.snapshot()); return; }
    if (path === "/events") {
      if (request.method === "HEAD") { response.writeHead(200).end(); return; }
      if (clients.size >= 16) { json(response, 503, { error: "Too many viewers on the local stream" }); return; }
      response.writeHead(200, { "Content-Type": "text/event-stream", Connection: "keep-alive", "X-Accel-Buffering": "no" });
      response.flushHeaders();
      response.write(`retry: 1500\ndata: ${JSON.stringify(pipeline.snapshot())}\n\n`);
      clients.add(response);
      const clientId = url.searchParams.get("world"); if (clientId && /^[a-f0-9-]{36}$/.test(clientId)) worlds.set(clientId, response);
      const send = (data: string) => {
        if (response.writableEnded || response.destroyed) return;
        // Node's high-water mark is not a disconnect signal. Bound a slow viewer's queue instead.
        if (response.writableLength + Buffer.byteLength(data) > 2_097_152) response.end();
        else response.write(data);
      };
      const unsubscribe = pipeline.subscribe((event, serialized) => send(`id: ${event.revision}\ndata: ${serialized}\n\n`));
      const heartbeat = setInterval(() => send(": heartbeat\n\n"), 15_000);
      response.once("close", () => { clearInterval(heartbeat); unsubscribe(); clients.delete(response); if (clientId && worlds.get(clientId) === response) worlds.delete(clientId); });
      return;
    }
    if (path === "/") { response.writeHead(302, { Location: "/world" }).end(); return; }
    const page = pages.get(path);
    const asset = path.startsWith("/assets/") ? assets.get(path.slice(8)) : undefined;
    const output = page ?? asset;
    if (!output) { response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found"); return; }
    response.writeHead(200, { "Content-Type": page ? "text/html; charset=utf-8" : path.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8" });
    response.end(request.method === "HEAD" ? undefined : output);
  })().catch(() => { if (!response.headersSent) json(response, 500, { error: "Local server request failed" }); else response.end(); }); });
  server.requestTimeout = 10_000;
  return { server, closeStreams() { for (const client of clients) client.end(); } };
}

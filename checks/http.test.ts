import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { createWorldServer } from "../server/http.js";
import { WorldPipeline } from "../server/pipeline.js";
import {Versions} from "../server/versions/index.js";
import {emptyUsage} from "../world/shared/limits.js";
import {randomUUID} from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
test("only the primary world may report a bounded base reservation, without checkpoint writes",async()=>{
 const root=await mkdtemp(join(tmpdir(),"base-report-")),versions=new Versions(root,()=>{});let writes=0;
 const app=await createWorldServer(new WorldPipeline(),undefined,undefined,versions,{live:false,durable:async()=>{writes++;},async fault(){}});await new Promise<void>(r=>app.server.listen(0,"127.0.0.1",r));const base=`http://127.0.0.1:${(app.server.address() as AddressInfo).port}`,controller=new AbortController();
 const clientId=randomUUID();try{const stream=await fetch(base+"/events?world="+clientId,{signal:controller.signal});await stream.body!.getReader().read();
  const report=(clientId:string,value:unknown)=>fetch(base+"/modules/budget",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientId,base:value})});
  assert.equal((await report("other",emptyUsage())).status,409);assert.equal((await report(clientId,{...emptyUsage(),triangles:-1})).status,409);const usage={...emptyUsage(),triangles:110000};assert.equal((await report(clientId,usage)).status,200);assert.deepEqual(versions.baseUsage,usage);assert.equal(writes,0);
 }finally{controller.abort();app.closeStreams();app.server.closeAllConnections();await new Promise<void>(r=>app.server.close(()=>r()));await rm(root,{recursive:true,force:true});}
});

/** Actual HTTP + SSE, using the same server factory as pnpm dev, on an ephemeral port. */
test("sim HTTP and SSE use the production pipeline, reconnect snapshots and reject unsafe requests", async () => {
  const pipeline = new WorldPipeline();
  const { server, closeStreams } = await createWorldServer(pipeline, undefined, undefined, undefined, {live:false,simulationAllowed:true,async fault(){}});
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const controller = new AbortController();
  try {
    const stream = await fetch(`${base}/events`, { signal: controller.signal });
    assert.equal(stream.headers.get("content-type"), "text/event-stream");
    const reader = stream.body!.getReader(), decoder = new TextDecoder();
    const initial = decoder.decode((await reader.read()).value);
    assert.ok(initial.includes('"type":"snapshot"')); assert.ok(initial.includes('"citizens":[]'));
    const chat = { id: "http-chat-1", userId: "local-viewer", displayName: "<img onerror=alert(1)>", color: "#79D7CF", text: "!dance" };
    const send = (path: string, body: unknown, origin?: string) => fetch(`${base}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body),
    });
    assert.equal((await send("/sim/chat", chat)).status, 200);
    const delta = decoder.decode((await reader.read()).value);
    assert.ok(delta.includes('"type":"chat"')); assert.ok(delta.includes('"spawned":true'));
    assert.equal(pipeline.roster.size, 1);
    const snapshot = await (await fetch(`${base}/api/world`)).json();
    assert.equal(snapshot.citizens[0].displayName, chat.displayName); // The browser renders this with textContent.
    assert.equal(snapshot.citizens[0].command.kind, "dance");
    const raid = { id: "http-raid", broadcasterId: "friend", broadcasterName: "Cloud", viewerCount: 80 };
    assert.equal((await send("/sim/raid", raid)).status, 200);
    assert.equal(pipeline.snapshot().raids, 1);
    assert.equal((await send("/sim/chat", chat, "https://example.com")).status, 403);
    assert.equal((await send("/sim/chat", { ...chat, text: "x".repeat(9000) })).status, 400);
    assert.equal((await fetch(`${base}/sim/chat`)).status, 405);
    assert.equal((await send("/sim/chat", { invalid: true })).status, 400);
    assert.equal((await fetch(`${base}/.env`)).status, 404);
    const world = await fetch(`${base}/world`);
    assert.ok(world.headers.get("content-security-policy")!.includes("connect-src 'self'"));
    const bundle = await (await fetch(`${base}/assets/world.js`)).text();
    assert.ok(!bundle.includes("TWITCH_ACCESS_TOKEN") && !bundle.includes("TWITCH_CLIENT_SECRET") && !bundle.includes("AWS_BEARER_TOKEN_BEDROCK"));
    const second = await fetch(`${base}/events`, { signal: controller.signal });
    const resumed = decoder.decode((await second.body!.getReader().read()).value);
    assert.ok(resumed.includes('"type":"snapshot"')); assert.ok(resumed.includes("local-viewer"));
  } finally {
    controller.abort(); closeStreams(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("fixture Summon HTTP uses the shared lane, validates receipts and enforces moderator clear", async () => {
  const { SummonService } = await import("../server/summon/index.js");
  const pipeline = new WorldPipeline();
  const records: import("../server/summon/index.js").SummonJob[] = [];
  const summons = new SummonService({ provider: (await import("../server/summon/provider.js")).fixtureProvider, mode:"fixture", config: { model: "openai.gpt-6.1-sol", effort: "max", tier: "ultrafast" },
    publish: event => pipeline.publish(event), reply() {}, record: job => { records.push(job); } });
  pipeline.attachSummon(summons);
  const { server, closeStreams } = await createWorldServer(pipeline, summons, undefined, undefined, {live:false,simulationAllowed:true,async fault(){}});
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, input: object) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const clientId = "00000000-0000-4000-8000-000000000001", controller = new AbortController();
  const stream = await fetch(`${base}/events?world=${clientId}`, {signal:controller.signal}); await stream.body!.getReader().read();
  try {
    const chat = { id: "fixture-http", userId: "viewer", displayName: "Viewer", color: "#79D7CF", text: "!summon a jellyfish", fixture: true };
    assert.equal((await post("/sim/chat", chat)).status, 200);
    await new Promise(resolve => setImmediate(resolve));
    const scene = pipeline.snapshot().summons[0]!; assert.ok(scene);
    assert.equal((await post("/summon/ack", { id: scene.id, receipt: "wrong" })).status, 409);
    assert.equal((await post("/summon/ack", { id: scene.id, receipt: scene.receipt, clientId })).status, 200);
    const job = await (await fetch(`${base}/api/summons/${scene.id}`)).json();
    assert.equal(job.status, "rendered"); assert.equal(job.valid, true); assert.equal(records.length, 1);
    const spoof = { ...chat, id: "forged-clear", userId: "outsider", text: "!clear", moderator: true };
    assert.equal((await (await post("/sim/chat", spoof)).json()).reason, "moderator-only");
    assert.equal(summons.active().length, 1);
    pipeline.chat({ ...chat, id: "real-clear", userId: "verified-mod", text: "!clear" }, { moderator: true });
    assert.equal(summons.active().length, 0);
  } finally { controller.abort(); closeStreams(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
test("all simulator and live automation routes are disabled without wiring permission", async () => {
 const app=await createWorldServer(new WorldPipeline());await new Promise<void>(r=>app.server.listen(0,"127.0.0.1",r));const base=`http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
 try { for(const route of ["/sim/chat","/sim/raid","/sim/eventsub","/sim/round","/runner/live"])assert.equal((await fetch(base+route,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"})).status,403); }
 finally{app.closeStreams();await new Promise<void>(r=>app.server.close(()=>r()))}
});

test("raid EventSub endpoint uses the live target filter and does not accept forged chat authority",async()=>{
 const {raidFixture}=await import("../server/twitch/raid.js");const p=new WorldPipeline(),app=await createWorldServer(p,undefined,undefined,undefined,{live:false,simulationAllowed:true,broadcasterId:"target",async fault(){}});await new Promise<void>(r=>app.server.listen(0,"127.0.0.1",r));const base=`http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
 const send=(value:unknown)=>fetch(base+"/sim/eventsub",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(value)});
 try{assert.equal((await (await send(raidFixture("wrong",150,"Clouds","wrong"))).json()).accepted,false);const raw=raidFixture("target",150,"Clouds","correct");assert.equal((await (await send(raw)).json()).admitted,150);assert.equal((await (await send(raw)).json()).reason,"duplicate");const fake={...raw,payload:{...raw.payload,subscription:{type:"channel.chat.message"}}};assert.equal((await (await send(fake)).json()).accepted,false);assert.equal(p.roster.size,150);}
 finally{app.closeStreams();await new Promise<void>(r=>app.server.close(()=>r()));}
});

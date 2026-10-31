import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { buildClient } from "./assets.js";
import { readConfig } from "./config.js";

const config = readConfig();
const assets = await buildClient();
const pages = new Map([
  ["/world", await readFile(new URL("../world/index.html", import.meta.url))],
  ["/overlay", await readFile(new URL("../overlay/index.html", import.meta.url))],
  ["/history", await readFile(new URL("../world/history.html", import.meta.url))],
]);
const csp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'none'";
const server = createServer((request, response) => {
  response.setHeader("Content-Security-Policy", csp);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  if (path === "/") {
    response.writeHead(302, { Location: "/world" }).end();
    return;
  }
  const page = pages.get(path);
  const asset = path.startsWith("/assets/") ? assets.get(path.slice(8)) : undefined;
  const body = page ?? asset;
  if (!body) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": page ? "text/html; charset=utf-8" : path.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8",
  });
  response.end(request.method === "HEAD" ? undefined : body);
});
server.on("error", error => { console.error(error.message); process.exitCode = 1; });
server.listen(config.port, config.host, () => console.log(`World: http://${config.host}:${config.port}/world`));
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => { server.close(); });
}

import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { createWorldServer } from "../server/http.js";
import { WorldPipeline } from "../server/pipeline.js";

/** Actual HTTP + SSE, using the same server factory as pnpm dev, on an ephemeral port. */
test("sim HTTP and SSE use the production pipeline, reconnect snapshots and reject unsafe requests", async () => {
  const pipeline = new WorldPipeline();
  const { server, closeStreams } = await createWorldServer(pipeline);
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
    assert.ok(!bundle.includes("TWITCH_ACCESS_TOKEN") && !bundle.includes("TWITCH_CLIENT_SECRET"));
    const second = await fetch(`${base}/events`, { signal: controller.signal });
    const resumed = decoder.decode((await second.body!.getReader().read()).value);
    assert.ok(resumed.includes('"type":"snapshot"')); assert.ok(resumed.includes("local-viewer"));
  } finally {
    controller.abort(); closeStreams(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

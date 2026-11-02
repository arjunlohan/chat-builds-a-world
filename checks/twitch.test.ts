import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type WebSocket from "ws";
import { connectTwitch, TwitchClient, EVENTSUB_URL } from "../server/twitch/index.js";
import { TwitchAuth, TwitchError, tokenStore, type TwitchConfig } from "../server/twitch/auth.js";
import { WorldPipeline } from "../server/pipeline.js";

// Synthetic fixtures only. No environment variables, credentials or network are used.
const config: TwitchConfig = { clientId: "test-client", clientSecret: "test-client-secret", accessToken: "test-access", refreshToken: "test-refresh", broadcasterId: "42" };
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const validation = () => reply({ client_id: config.clientId, user_id: "42", scopes: ["user:read:chat", "user:write:chat"] });
const settle = async () => { for (let i = 0; i < 3; i++) await new Promise<void>(resolve => setImmediate(resolve)); };
class Socket extends EventEmitter {
  closed = false;
  close() { this.closed = true; this.emit("close"); }
  terminate() { this.closed = true; }
  message(type: string, payload: object = {}, id = "envelope") { this.emit("message", Buffer.from(JSON.stringify({ metadata: { message_type: type, message_id: id }, payload }))); }
  welcome(id = "session") { this.message("session_welcome", { session: { id, keepalive_timeout_seconds: 10 } }); }
}
function fixture() {
  let now = 0, sequence = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const sockets: Socket[] = [], urls: string[] = [], requests: { path: string; body: unknown }[] = [], logs: string[] = [];
  const world = new WorldPipeline(() => now);
  const fetcher: typeof fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    requests.push({ path, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    return path.endsWith("validate") ? validation() : path.endsWith("messages") ? reply({ data: [{ is_sent: true, message_id: "sent" }] }) : reply({}, 202);
  };
  const client = new TwitchClient(config, { onStatus:status=>world.setTwitchStatus(status),onChat: (event, authority) => { world.chat(event, authority); }, onRaid: event => { world.raid(event); } }, {
    fetch: fetcher, store: { load: async () => undefined, save: async () => {} }, log: line => logs.push(line), now: () => now, random: () => 0.5,
    socket: url => { urls.push(url); const socket = new Socket(); sockets.push(socket); return socket as unknown as WebSocket; },
    setTimer: (callback, ms) => { const id = ++sequence; timers.set(id, { at: now + ms, callback }); return id as unknown as ReturnType<typeof setTimeout>; },
    clearTimer: timer => { timers.delete(timer as unknown as number); },
  });
  return { client, sockets, urls, requests, world, logs, timers,
    async advance(ms: number) {
      const end = now + ms;
      for (let i = 0; i < 100; i++) {
        const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at; timers.delete(next[0]); next[1].callback(); await settle();
      }
      now = end; await settle();
    },
  };
}
const notification = (socket: Socket, id = "chat-1", broadcaster = "42") => socket.message("notification", {
  subscription: { type: "channel.chat.message" }, event: { broadcaster_user_id: broadcaster,
    chatter_user_id: "100", chatter_user_name: "Moss", message_id: id, color: "#79D7CF", message: { text: "!jump" }, badges: [] },
});

test("missing Twitch vars emit one warning and never attempt a network connection", async () => {
  const logs: string[] = [];
  const client = connectTwitch({ onChat() {}, onRaid() {} }, undefined, { log: line => logs.push(line), fetch: async () => { throw new Error("must not fetch"); } });
  assert.equal(logs.length, 1); assert.ok(logs[0]!.includes("sim-only"));
  await assert.rejects(() => client.sendChat("hello"), TwitchError); client.stop();
});
test("welcome creates the exact chat and incoming raid subscriptions, then feeds the shared pipeline", async () => {
  const f = fixture(); await f.client.start();
  assert.deepEqual(f.urls, [EVENTSUB_URL]); f.sockets[0]!.welcome(); await settle();
  const subscriptions = f.requests.filter(r => r.path.endsWith("subscriptions")).map(r => r.body);
  assert.deepEqual(subscriptions, [
    { type: "channel.chat.message", condition: { broadcaster_user_id: "42", user_id: "42" }, version: "1", transport: { method: "websocket", session_id: "session" } },
    { type: "channel.raid", condition: { to_broadcaster_user_id: "42" }, version: "1", transport: { method: "websocket", session_id: "session" } },
  ]);
  notification(f.sockets[0]!); notification(f.sockets[0]!); notification(f.sockets[0]!, "other", "wrong-channel");
  f.sockets[0]!.message("notification", { subscription: { type: "channel.raid" }, event: {
    to_broadcaster_user_id: "42", from_broadcaster_user_id: "friend", from_broadcaster_user_name: "CloudGarden", viewers: 20,
  } }, "raid-1");
  await settle();
  assert.equal(f.world.roster.size, 21); assert.equal(f.world.roster.get("100")!.color, "#79D7CF");
  assert.equal(f.world.roster.get("100")!.command?.kind, "jump"); assert.equal(f.world.snapshot().raids, 1);
  assert.equal(await f.client.sendChat("hello"), "sent");
  assert.deepEqual(f.requests.find(r => r.path.endsWith("messages"))!.body, { broadcaster_id: "42", sender_id: "42", message: "hello" });
  f.client.stop(); assert.equal(f.timers.size, 0);
});
test("session_reconnect keeps the old socket until the replacement welcome and does not resubscribe", async () => {
  const f = fixture(); await f.client.start(); const old = f.sockets[0]!; old.welcome(); await settle();
  const url = "wss://eventsub.wss.twitch.tv/ws?reconnect=opaque-ticket";
  old.message("session_reconnect", { session: { reconnect_url: url } }); await settle();
  assert.equal(old.closed, false); assert.equal(f.urls[1], url);
  notification(old); await settle(); assert.equal(f.world.roster.size, 1);
  f.sockets[1]!.welcome("migrated"); await settle();
  assert.equal(old.closed, true); assert.equal(f.requests.filter(r => r.path.endsWith("subscriptions")).length, 2);
  f.client.stop();
});
test("keepalive renews the watchdog; silence reconnects and recreates subscriptions", async () => {
  const f = fixture(); await f.client.start(); f.sockets[0]!.welcome(); await settle();
  await f.advance(9000); f.sockets[0]!.message("session_keepalive"); await f.advance(9000);
  assert.equal(f.sockets.length, 1); assert.equal(f.sockets[0]!.closed, false);
  await f.advance(3000); assert.equal(f.sockets.length, 2);
  f.sockets[1]!.welcome("fresh"); await settle();
  assert.equal(f.requests.filter(r => r.path.endsWith("subscriptions")).length, 4);
  f.client.stop();
});
test("network errors use increasing backoff; invalid reconnect URLs are never opened", async () => {
  const f = fixture(); await f.client.start(); f.sockets[0]!.emit("error");
  await f.advance(999); assert.equal(f.sockets.length, 1); await f.advance(1); assert.equal(f.sockets.length, 2);
  f.sockets[1]!.emit("error"); await f.advance(1999); assert.equal(f.sockets.length, 2);
  await f.advance(1); assert.equal(f.sockets.length, 3);
  f.sockets[2]!.welcome(); await settle();
  f.sockets[2]!.message("session_reconnect", { session: { reconnect_url: "wss://example.com/steal" } }); await settle();
  assert.equal(f.urls.length, 3); assert.ok(f.urls.every(url => url.startsWith(EVENTSUB_URL)));
  f.client.stop();
});
test("revocation ends the OAuth session and leaves the world pipeline available", async () => {
  const f = fixture(); await f.client.start(); f.sockets[0]!.welcome(); await settle();
  f.sockets[0]!.message("revocation", { subscription: { type: "channel.chat.message" } }); await settle();
  assert.equal(f.sockets[0]!.closed, true); assert.equal(f.timers.size, 0);
  assert.ok(f.logs.some(line => line.includes("authorization/scopes")));
  assert.equal(f.world.chat({ id: "local", userId: "local", displayName: "Local", color: "", text: "still works" }).accepted, true);
});
test("concurrent 401 responses share a single refresh, URL-encode it and persist rotated tokens", async () => {
  let refreshes = 0, saved = 0;
  const auth = new TwitchAuth(config, async (url, init) => {
    if (String(url).endsWith("/token")) {
      refreshes++; assert.ok(init?.body instanceof URLSearchParams);
      assert.ok((init.body as URLSearchParams).get("grant_type") === "refresh_token");
      return reply({ access_token: "test-rotated-access", refresh_token: "test-rotated-refresh" });
    }
    const authorization = (init?.headers as Record<string, string>).Authorization;
    return authorization?.endsWith("test-access") ? reply({}, 401) : reply({}, 202);
  }, { load: async () => undefined, save: async () => { saved++; } });
  const responses = await Promise.all([auth.helix("eventsub/subscriptions", {}), auth.helix("eventsub/subscriptions", {})]);
  assert.ok(responses.every(response => response.status === 202)); assert.equal(refreshes, 1); assert.equal(saved, 1);
});
test("validation rejects a token for a different identity, and request errors never leak credentials", async () => {
  const auth = new TwitchAuth(config, async () => reply({ client_id: "wrong", user_id: "42", scopes: [] }));
  await assert.rejects(() => auth.validate(), TwitchError);
  const logs: string[] = [];
  const client = new TwitchClient(config, { onChat() {}, onRaid() {} }, {
    fetch: async () => { throw new Error(config.accessToken); }, store: { load: async () => undefined, save: async () => {} }, log: line => logs.push(line),
  });
  await client.start(); client.stop();
  assert.ok(logs.length > 0); assert.ok(logs.every(line => ![config.accessToken, config.refreshToken, config.clientSecret].some(secret => line.includes(secret))));
});

test("rotated credentials persist privately, restore on restart and invalidate when env/account changes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "world-token-test-"));
  try {
    const store = tokenStore(config, directory);
    assert.equal(await store.load(), undefined);
    await store.save({ accessToken: "fixture-access", refreshToken: "fixture-refresh" });
    assert.ok((await store.load())?.refreshToken === "fixture-refresh");
    assert.ok((await tokenStore(config, directory).load())?.accessToken === "fixture-access");
    assert.equal((await stat(join(directory, "twitch-auth.json"))).mode & 0o777, 0o600);
    assert.equal(await tokenStore({ ...config, refreshToken: "changed-env" }, directory).load(), undefined);
    assert.equal(await tokenStore({ ...config, broadcasterId: "different-account" }, directory).load(), undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("configured Twitch stays visibly disconnected after an invalid refresh; no credentials stay disabled",async()=>{
 const world=new WorldPipeline(),statuses:string[]=[];
 const client=new TwitchClient(config,{onChat(){},onRaid(){},onStatus:status=>{statuses.push(status);world.setTwitchStatus(status);}},{fetch:async url=>String(url).endsWith("/token")?reply({},400):reply({},401),store:{load:async()=>undefined,save:async()=>{}},log(){}});
 await client.start();assert.deepEqual(statuses,["disconnected"]);assert.equal(world.snapshot().twitch,"disconnected");client.stop();
 connectTwitch({onChat(){},onRaid(){},onStatus:status=>world.setTwitchStatus(status)},undefined,{log(){}});assert.equal(world.snapshot().twitch,"disabled");
 const f=fixture();await f.client.start();assert.equal(f.world.snapshot().twitch,"disconnected");f.sockets[0]!.welcome();await settle();assert.equal(f.world.snapshot().twitch,"connected");f.sockets[0]!.emit("error");assert.equal(f.world.snapshot().twitch,"disconnected");f.client.stop();
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from "three";
import type { WorldModule, WorldServices } from "../world/engine/api.js";
import { ModuleHost, type ModuleStatus } from "../world/engine/module-host.js";
import { ResourceLedger, ResourceOwner } from "../world/engine/resources.js";
import { CameraDirector } from "../world/engine/camera-director.js";
import { FrameStats } from "../world/engine/stats.js";

function fixture() {
  let clock = 0;
  const events: string[] = [], status: ModuleStatus[] = [];
  const root = new Group();
  const services: Omit<WorldServices, "scene"> = {
    citizens: { get: () => undefined, list: () => [] },
    spawnSpec: () => ({ id: "spawn", dispose() { events.push("spawn disposed"); } }),
    camera: { focus: () => events.push("focus") }, effects: { play: () => events.push("effect") },
    log: (_level, message) => events.push(message),
  };
  const host = new ModuleHost({ root, services, now: () => clock, onStatus: event => status.push(event) });
  const module = (id: string, changes: Partial<WorldModule> = {}): WorldModule => ({
    id, init() {}, update() {}, onChat() {}, onCitizenSpawn() {}, onRaid() {}, dispose() { events.push(`dispose:${id}`); }, ...changes,
  });
  return { root, host, module, events, status, advance(ms: number) { clock += ms; } };
}

test("host routes FIFO events before update, freezes data, clamps dt and pauses", () => {
  const f = fixture(), seen: string[] = [];
  let dt = -1;
  f.host.load(() => f.module("one", {
    onChat(event) { assert.ok(Object.isFrozen(event)); seen.push(event.text); },
    onCitizenSpawn(citizen) { assert.ok(Object.isFrozen(citizen.position)); seen.push(citizen.id); },
    onRaid(event) { assert.ok(Object.isFrozen(event)); seen.push(event.broadcasterName); },
    update(seconds) { dt = seconds; seen.push("update"); },
  }));
  f.host.onChat({ id: "1", userId: "x", displayName: "x", color: "#ffffff", text: "first", timestamp: 0 });
  f.host.onCitizenSpawn({ id: "citizen", displayName: "c", color: "#fff", position: new Vector3() });
  f.host.onRaid({ id: "raid", broadcasterId: "r", broadcasterName: "raider", viewerCount: 10 });
  f.host.setPaused(true); f.host.update(5); assert.deepEqual(seen, []);
  f.host.setPaused(false); f.host.update(5);
  assert.equal(dt, 0.05);
  assert.deepEqual(seen, ["first", "citizen", "raider", "update"]);
});

test("hook exceptions disable immediately and dispose resources even if dispose throws", () => {
  const f = fixture();
  const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
  let geometryDisposed = 0, materialDisposed = 0;
  geometry.addEventListener("dispose", () => geometryDisposed++);
  material.addEventListener("dispose", () => materialDisposed++);
  f.host.load(() => f.module("broken", {
    init(s) { s.scene.add(new Mesh(geometry, material)); },
    update() { throw new Error("untrusted error text should not be displayed"); },
    dispose() { throw new Error("also broken"); },
  }));
  f.host.update(0.016);
  assert.equal(f.host.activeCount, 0); assert.equal(f.root.children.length, 0);
  assert.equal(geometryDisposed, 1); assert.equal(materialDisposed, 1);
  assert.ok(f.status.some(s => s.reason === "update threw"));
});

test("three overruns disable, global 4 ms stops work and scheduling stays fair", () => {
  const f = fixture();
  const calls: string[] = [];
  for (const id of ["a", "b", "c"]) f.host.load(() => f.module(id, { update() { calls.push(id); f.advance(2.1); } }));
  f.host.update(0.016);
  assert.deepEqual(calls, ["a", "b"]);
  for (let i = 0; i < 4; i++) f.host.update(0.016);
  assert.ok(calls.includes("c"));
  assert.equal(f.host.activeCount, 0);
  assert.ok(f.status.some(s => s.reason.includes("three 2 ms overruns")));
});

test("overruns age out after 60 frames and dt never propagates NaN", () => {
  const f = fixture(); let costly = true;
  f.host.load(() => f.module("window", { update(dt) { assert.ok(Number.isFinite(dt)); if (costly) f.advance(3); } }));
  f.host.update(NaN); f.host.update(0.016);
  costly = false; for (let i = 0; i < 61; i++) f.host.update(0.016);
  costly = true; f.host.update(0.016); assert.equal(f.host.activeCount, 1);
});

test("queues cap at 128, deliver 16 per frame, and warn at most once a second", () => {
  const f = fixture(), seen: string[] = [];
  f.host.load(() => f.module("queue", { onChat(event) { seen.push(event.id); } }));
  for (let i = 0; i < 140; i++) f.host.onChat({ id: String(i), userId: "x", displayName: "x", color: "#fff", text: "hi", timestamp: 0 });
  f.host.update(0.016);
  assert.equal(seen.length, 16); assert.equal(seen[0], "12");
  assert.equal(f.events.filter(e => e.includes("queue full")).length, 1);
});

test("service capabilities are scoped, rate limited and owned spawn cleanup is idempotent", () => {
  const f = fixture(); let captured!: WorldServices;
  f.host.load(() => f.module("services", { init(s) {
    captured = s; assert.notEqual(s.scene, f.root);
    for (let i = 0; i < 20; i++) { s.camera.focus(new Vector3()); s.effects.play("sparkle", new Vector3()); s.log("info", "hello"); }
    const h = s.spawnSpec({} as never); h.dispose(); h.dispose();
    s.spawnSpec({} as never);
  } }));
  assert.equal(f.events.filter(e => e === "focus").length, 1);
  assert.equal(f.events.filter(e => e === "effect").length, 4);
  assert.equal(f.events.filter(e => e.includes("hello")).length, 10);
  f.host.unload("services");
  assert.equal(f.events.filter(e => e === "spawn disposed").length, 2);
  assert.throws(() => captured.log("info", "after dispose"));
});

test("failed/slow/async candidate preserves the previous instance; replacement disposes once", () => {
  const f = fixture(); f.host.load(() => f.module("same"));
  assert.equal(f.host.load(() => f.module("same", { init() { throw new Error(); } })), false);
  assert.equal(f.host.activeCount, 1);
  assert.equal(f.host.load(() => f.module("same", { init() { f.advance(9); } })), false);
  assert.equal(f.host.activeCount, 1);
  assert.equal(f.host.load(() => f.module("async", { init: (async () => {}) as () => void })), false);
  assert.equal(f.host.load(() => f.module("same")), true);
  f.host.dispose(); f.host.dispose();
  assert.equal(f.events.filter(e => e === "dispose:same").length, 4);
});

test("host caps modules and rejects resource excess or shared engine assets", () => {
  const f = fixture();
  for (let i = 0; i < 8; i++) assert.ok(f.host.load(() => f.module(`m${i}`)));
  assert.equal(f.host.load(() => f.module("ninth")), false);
  f.host.dispose();
  assert.equal(f.host.load(() => f.module("tooMany", { init(s) {
    const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
    for (let i = 0; i < 65; i++) s.scene.add(new Mesh(geometry, material));
  } })), false);
  const owner = new ResourceOwner(), engine = new Group(), geometry = new BoxGeometry();
  engine.add(new Mesh(geometry, new MeshBasicMaterial())); owner.audit(engine);
  const root = new Group(), moduleOwner = new ResourceOwner(owner);
  root.add(new Mesh(geometry, new MeshBasicMaterial()));
  assert.throws(() => moduleOwner.audit(root), /not module-owned/);
  const ledger = new ResourceLedger({ nodes: 1000, triangles: 0, draws: 0, lights: 0, particles: 0 });
  assert.throws(() => ledger.reserve("large", { nodes: 30, triangles: 0, draws: 30, lights: 0, particles: 0 }), /world limit/);
});

test("camera focus is continuous, bounded, priority-aware and returns to drift", () => {
  const camera = new PerspectiveCamera(), director = new CameraDirector(camera);
  const before = camera.position.clone();
  director.focus(new Vector3(3, 2, 1), { duration: 1, priority: 3 });
  assert.equal(camera.position.distanceTo(before), 0);
  director.update(0.01); assert.ok(camera.position.distanceTo(before) < 0.01);
  director.focus(new Vector3(100, 100, 100), { priority: 0 });
  for (let i = 0; i < 1000; i++) director.update(0.016);
  assert.ok(camera.position.distanceTo(before) < 8);
  assert.ok(camera.position.toArray().every(Number.isFinite));
});

test("frame stats use real time, rolling samples and exclude hidden-tab pauses", () => {
  const stats = new FrameStats();
  for (let i = 0; i < 121; i++) stats.sample(i * 1000 / 60);
  assert.ok(Math.abs(stats.value.avgFps - 60) < 0.01);
  assert.equal(stats.value.frame, 121);
  stats.resetClock(); stats.sample(100_000);
  assert.ok(Math.abs(stats.value.avgFps - 60) < 0.01);
  stats.sample(100_000 + 1000 / 30);
  assert.ok(stats.value.avgFps < 60);
});
test("shared world bounds handle box extents and light radii consistently",async()=>{
 const {clampToWorld,fitsBounds}=await import("../world/shared/limits.js");
 const p=new Vector3(100,-10,-100),extent=new Vector3(2,3,4);assert.equal(clampToWorld(p,extent),p);assert.deepEqual(p.toArray(),[62,-5,-60]);assert.equal(fitsBounds(p,extent),true);
 assert.equal(fitsBounds(new Vector3(63,0,0),2),false);assert.deepEqual(clampToWorld(new Vector3(63,0,0),2).toArray(),[62,0,0]);
 assert.throws(()=>clampToWorld(new Vector3(),new Vector3(65,0,0)));assert.equal(fitsBounds(new Vector3(NaN,0,0)),false);
});

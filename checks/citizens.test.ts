import assert from "node:assert/strict";
import { test } from "node:test";
import { CitizenRoster } from "../server/citizens/index.js";
import { IDLE_MS, FADE_MS } from "../world/shared/limits.js";
import { WorldPipeline } from "../server/pipeline.js";
import { CameraDirector } from "../world/engine/camera-director.js";
import { PerspectiveCamera, Vector3 } from "three";
import { isWalkable } from "../world/engine/land.js";
import { stepOnLand } from "../world/engine/navigation.js";
import { crowdScenario } from "../server/sim/scenario.js";
const chat = (id: string, userId = id, text = "hello") => ({ id, userId, displayName: userId, color: "#E9A18E", text, timestamp: 999_999_999 });

test("first message creates one named/tinted citizen and preserves home on future messages", () => {
  const roster = new CitizenRoster();
  const one = roster.accept(chat("1", "Moss"), 1000)!;
  const two = roster.accept(chat("2", "Moss", "a second line"), 2000)!;
  assert.equal(one.spawned, true); assert.equal(two.spawned, false); assert.equal(roster.size, 1);
  assert.equal(two.citizen.color, "#E9A18E"); assert.equal(two.citizen.displayName, "Moss");
  assert.equal(two.citizen.speech, "a second line"); assert.deepEqual(one.citizen.home, two.citizen.home);
  assert.equal(two.citizen.lastActive, 2000); assert.ok(Object.isFrozen(two.citizen));
});
test("300 citizen limit uses unique dry homes and safely rejects overflow", () => {
  const roster = new CitizenRoster();
  for (let i = 0; i < 300; i++) assert.ok(roster.accept(chat(String(i)), 0));
  assert.equal(roster.size, 300); assert.equal(roster.accept(chat("overflow"), 0), undefined);
  assert.equal(new Set(roster.list().map(c => c.home.join(","))).size, 300);
  assert.ok(roster.list().every(c => isWalkable(c.home[0], c.home[2])));
  assert.ok(roster.accept(chat("update", "0"), 1000));
});
test("expiry allows five seconds to fade after 20 minutes and activity revives the citizen", () => {
  const roster = new CitizenRoster(); roster.accept(chat("1", "Moss"), 0);
  assert.deepEqual(roster.prune(IDLE_MS), []);
  assert.deepEqual(roster.prune(IDLE_MS + FADE_MS - 1), []);
  roster.accept(chat("2", "Moss"), IDLE_MS + 1000);
  assert.deepEqual(roster.prune(IDLE_MS + FADE_MS), []);
  assert.deepEqual(roster.prune(2 * IDLE_MS + FADE_MS + 1000), ["Moss"]);
});
test("commands resolve follow by display name, reject self/missing target, and return home", () => {
  const roster = new CitizenRoster(); roster.accept(chat("a", "Moss"), 0);
  const follow = roster.accept(chat("b", "Fern", "!follow @mOsS"), 100)!;
  assert.deepEqual(follow.citizen.command, { kind: "follow", targetId: "Moss" });
  const missing = roster.accept(chat("c", "Fern", "!follow missing"), 200)!;
  assert.deepEqual(missing.citizen.command, follow.citizen.command);
  for (const kind of ["jump", "dance", "home"]) {
    const result = roster.accept(chat(kind, "Fern", `!${kind}`), 300)!;
    assert.deepEqual(result.citizen.command, { kind });
  }
});
test("shared pipeline deduplicates, limits floods, strips timestamps and does not grant sim moderation", () => {
  let now = 1000; const world = new WorldPipeline(() => now); const events: unknown[] = [];
  world.subscribe(event => events.push(event));
  assert.equal(world.chat(chat("1", "Moss")).accepted, true);
  assert.equal(world.chat(chat("1", "Moss")).reason, "duplicate");
  assert.equal(world.chat(chat("2", "Moss")).reason, "rate-limited");
  assert.equal(world.roster.get("Moss")!.lastActive, now);
  assert.equal(world.chat({ ...chat("3", "Other", "!pause"), moderator: true }).reason, "moderator-only");
  assert.equal(world.chat(chat("4", "Mod", "!pause"), { moderator: true }).accepted, true);
  assert.equal(world.chat(chat("5", "Fern")).reason, "paused");
  now += 250; world.chat(chat("6", "Mod", "!pause"), { moderator: true });
  now += 1000; assert.equal(world.chat(chat("7", "Moss")).accepted, true);
  assert.equal(world.chat(chat("8", "Bad", "doxxing")).reason, "blocked");
  assert.equal(world.roster.size, 1); assert.ok(events.length > 0);
  assert.throws(() => world.chat({ ...chat("bad"), color: "red; background:url(https://example.com)" }));
});
test("raid dedupe and pruning reach every observer via the same pipeline", () => {
  let now = 0; const world = new WorldPipeline(() => now); const seen: string[] = [];
  const unsubscribe = world.subscribe(event => seen.push(event.type));
  world.chat(chat("a"));
  const raid = { id: "raid-1", broadcasterId: "friend", broadcasterName: "CloudGarden", viewerCount: 80 };
  world.raid(raid); assert.equal(world.raid(raid).reason, "duplicate");
  now = IDLE_MS + FADE_MS; world.prune();
  assert.deepEqual(seen, ["chat", "raid", "remove"]); assert.equal(world.snapshot().raids, 1);
  unsubscribe();
});
test("scripted simulator admits 80 chatters, 24 raiders, 160 messages and one raid", () => {
  let now = 0; const world = new WorldPipeline(() => now);
  const scenario = crowdScenario("test");
  for (const step of scenario) {
    now += step.delay;
    assert.equal((step.kind === "chat" ? world.chat(step.event) : world.raid(step.event)).accepted, true);
  }
  assert.equal(world.roster.size, 104); assert.equal(world.roster.list().filter(c=>c.entry).length,24); assert.equal(scenario.length, 161); assert.equal(world.snapshot().raids, 1);
  for (const kind of ["jump", "dance", "home", "follow"]) assert.equal(world.roster.list().filter(c => c.command?.kind === kind).length, 20);
});
test("automatic camera notices coalesce a crowd instead of restarting every frame", () => {
  const camera = new PerspectiveCamera(), director = new CameraDirector(camera);
  for (let i = 0; i < 600; i++) { director.notice(new Vector3(Math.sin(i) * 6, 2, Math.cos(i) * 5)); director.update(1 / 60); }
  assert.equal(director.automaticFocuses, 2);
  assert.ok(camera.position.toArray().every(Number.isFinite));
});

test("follow steering routes around the spring and stays on dry ground", () => {
  for (const reverse of [false, true]) {
    const position = reverse ? { x: 2, z: 0.5 } : { x: -7, z: -0.4 };
    const target = reverse ? { x: -7, z: -0.4 } : { x: 2, z: 0.5 };
    assert.ok(isWalkable(position.x, position.z)); assert.ok(isWalkable(target.x, target.z));
    for (let i = 0; i < 2000; i++) {
      stepOnLand(position, target.x, target.z, 1.1 / 60);
      assert.ok(isWalkable(position.x, position.z));
    }
    assert.ok(Math.hypot(position.x - target.x, position.z - target.z) < 0.1);
  }
});

test("chat commands never become speech, while normal lines still do", () => {
  const roster = new CitizenRoster();
  for (const text of ["!idea A small lantern", "!vote 2", "!summon crystal", "!jump", "!dance", "!follow Moss", "!home", "!unknown command"]) {
    const result = roster.accept(chat(`cmd${text}`, "Moss", text), 1000)!;
    assert.equal(result.citizen.speech, ""); assert.equal(result.citizen.speechAt, 0);
  }
  assert.equal(roster.accept(chat("plain", "Moss", "A beautiful garden!"), 2000)!.citizen.speech, "A beautiful garden!");
});
test("blocked messages consume admission rate and rejection replies are bounded", () => {
 let now=1000;const p=new WorldPipeline(()=>now), replies:unknown[]=[];p.subscribe(e=>{if(e.type==="reply")replies.push(e)});
 assert.equal(p.chat(chat("blocked1","spam","!summon doxxing")).reason,"blocked");
 for(let i=0;i<100;i++)assert.equal(p.chat(chat(`spam${i}`,"spam","!summon doxxing")).reason,"rate-limited");
 now+=300;assert.equal(p.chat(chat("blocked2","spam","!summon doxxing")).reason,"blocked");assert.equal(replies.length,1);
});
test("immutable garden batching preserves its authored triangle budget and finite bounds", async () => {
 const {createGarden}=await import("../world/engine/garden.js"),{ResourceOwner}=await import("../world/engine/resources.js"),{Box3}=await import("three");
 for(const [look,triangles] of [["classic",14696],["new",17464]] as const){const garden=createGarden(look),owner=new ResourceOwner(),used=owner.audit(garden);assert.equal(used.triangles,triangles);assert.ok(used.draws<12);assert.ok(new Box3().setFromObject(garden).min.toArray().every(Number.isFinite));owner.dispose(garden);}
});
test("label transforms remain stable even when the browser normalizes style strings", async()=>{
 const {LabelManager}=await import("../world/engine/labels.js");let reads=0,writes=0;
 const style={width:"",opacity:"",get transform(){reads++;return "normalized browser transform"},set transform(_value:string){writes++;}};
 const element={hidden:true,dataset:{},style,remove(){}} as unknown as HTMLElement;
 const manager=new LabelManager();manager.add("stable",element,c=>{c.x=960;c.y=540;c.width=100;c.height=26;c.kind="tag";c.opacity=1;c.priority=1;return true;});
 manager.update(0,new PerspectiveCamera());manager.update(60,new PerspectiveCamera());
 assert.equal(element.hidden,false);assert.equal(writes,1);assert.equal(reads,0);manager.dispose();
});
test("direct static batches retain indexed and non-indexed transforms, normals and instance tints",async()=>{
 const {Group,Mesh,InstancedMesh,PlaneGeometry,MeshStandardMaterial,Matrix4,Color}=await import("three"),{batchStaticGarden}=await import("../world/engine/static-batch.js");
 const root=new Group(),material=new MeshStandardMaterial(),geometry=new PlaneGeometry(2,2),instances=new InstancedMesh(geometry,material,2);
 instances.setMatrixAt(0,new Matrix4().makeTranslation(3,0,0));instances.setMatrixAt(1,new Matrix4().makeScale(2,3,1));instances.setColorAt(0,new Color().setRGB(.5,.25,.125));instances.setColorAt(1,new Color().setRGB(1,1,1));root.add(instances);
 const plain=new Mesh(geometry.toNonIndexed(),material);plain.position.z=4;root.add(plain);
 batchStaticGarden(root);assert.equal(root.children.length,1);const combined=(root.children[0] as import("three").Mesh).geometry,p=combined.getAttribute("position"),n=combined.getAttribute("normal"),c=combined.getAttribute("color");
 assert.equal(combined.index!.count,18);assert.deepEqual([p.getX(0),p.getY(0),p.getZ(0)],[2,1,0]);
 assert.deepEqual([p.getX(4),p.getY(4),p.getZ(4)],[-2,3,0]);assert.equal(p.getZ(8),4);
 assert.deepEqual([n.getX(0),n.getY(0),n.getZ(0)],[0,0,1]);assert.deepEqual([c.getX(0),c.getY(0),c.getZ(0)],[.5,.25,.125]);
 combined.dispose();(root.children[0] as import("three").Mesh).material instanceof MeshStandardMaterial&&((root.children[0] as import("three").Mesh).material as import("three").Material).dispose();
});

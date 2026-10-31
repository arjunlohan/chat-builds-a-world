import { Group, PerspectiveCamera, Vector3 } from "three";
import { SpecMaterializer } from "../world/engine/spec-materializer.js";
import { ResourceLedger } from "../world/engine/resources.js";
import { LabelManager } from "../world/engine/labels.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import prompts from "./summon-prompts.json";
import { fixtureFor, bedrockProvider, fixtureProvider, responseSchema, SummonError, zeroUsage } from "../server/summon/provider.js";
import { SummonService, type SummonJob } from "../server/summon/index.js";
import { normalizeSceneSpec, parseSceneSpec, specUsage, type SceneSpec } from "../server/summon/scene-spec.js";
import { createSpecGeometry, triangleCost } from "../world/engine/spec-geometry.js";
import { packLabels, citizenLabelMode, type LabelCandidate } from "../world/engine/labels.js";
import { WorldPipeline } from "../server/pipeline.js";

const config = { model: "openai.gpt-6.1-sol", effort: "max", tier: "ultrafast" };
function mutate(spec: SceneSpec, kind?: string) {
  const s = structuredClone(spec);
  if (kind === "code") Object.assign(s, { code: "globalThis.shouldNeverExecute = true" });
  if (kind === "texture") Object.assign(s.materials[0]!, { map: "https://example.com/texture" });
  if (kind === "nodes") s.nodes = Array.from({ length: 65 }, (_, i) => ({ ...s.nodes[0]!, id: `n${i}` }));
  if (kind === "duplicate") s.nodes[0]!.id = s.geometries[0]!.id;
  if (kind === "reference") s.nodes[0]!.geometryId = "missing";
  if (kind === "geometry") Object.assign(s.geometries[0]!, { kind: "arbitrary-shader" });
  if (kind === "behavior") s.behaviors = [{ id: "bad", kind: "follow-citizen", targetId: s.nodes[0]!.id, citizenId: "https://example.com", speed: 1, amplitude: 0, radius: 1 }];
  if (kind === "bytes") s.name = "x".repeat(33_000);
  if (kind === "numeric") { s.nodes[0]!.position = [999, -999, 999]; s.materials[0]!.emissiveIntensity = 500; s.geometries[0]!.size = [100, 100, 100]; }
  return s;
}
for (const prompt of prompts) test(`${prompt.id}: ${prompt.expected}: ${prompt.prompt}`, async () => {
  const records: SummonJob[] = [], replies: string[] = [];
  let published: import("../server/contracts.js").SummonState | undefined;
  const service = new SummonService({ config, now: () => 1000, record: j => { records.push(j); },
    publish: e => { if (e.type === "summon") published = e.summon; }, reply: (_c, text) => { replies.push(text); },
    mode: "fixture", provider: { async generate() { return { json: JSON.stringify(mutate(fixtureFor(prompt.fixture) as SceneSpec, "mutate" in prompt ? prompt.mutate : undefined)), usage: zeroUsage() }; } },
  });
  if (prompt.expected === "blocked") { const { allowedWish } = await import("../server/content-policy.js"); assert.equal(allowedWish(prompt.prompt),false); return; }
  const job = await service.submit({ id: prompt.id, userId: "tester", displayName: "FixtureTester", color: "#79D7CF", text: `!summon ${prompt.prompt}`, timestamp: 1000 });
  if (prompt.expected === "render") {
    assert.equal(job.status, "awaiting-render"); assert.ok(published);
    const scene = published;
    assert.doesNotThrow(() => parseSceneSpec(JSON.stringify(scene.spec)));
    assert.equal(await service.acknowledge(job.id, published.receipt), true);
    assert.equal(records[0]!.status, "rendered"); assert.equal(records[0]!.mode, "fixture");
    if ("mutate" in prompt && prompt.mutate === "numeric") assert.equal(job.clamped, true);
  } else { assert.equal(job.status, "failed"); assert.equal(job.reason, prompt.expected === "blocked" ? "blocked" : "invalid-spec"); assert.ok(replies.length); assert.equal(published, undefined); }
});

test("numeric clamping is bounded and structural/code/count/reference errors never get repaired", () => {
  const spec = mutate(fixtureFor("jellyfish") as SceneSpec, "numeric");
  const { spec: safe, clamped } = normalizeSceneSpec(JSON.stringify(spec));
  assert.ok(clamped); assert.equal(safe.materials[0]!.emissiveIntensity, 2);
  assert.doesNotThrow(() => parseSceneSpec(JSON.stringify(safe)));
  assert.throws(() => normalizeSceneSpec(JSON.stringify({ ...safe, script: "alert(1)" })));
});
test("all nine recipes at four detail levels match their workload estimates", () => {
  for (const kind of ["box", "sphere", "cylinder", "cone", "torus", "plane", "crystal", "mushroom", "tree"] as const) for (let detail = 0; detail <= 3; detail++) {
    const geometry = createSpecGeometry({ id: "g", kind, detail, size: [2, 3, 2] });
    assert.equal((geometry.index?.count ?? geometry.getAttribute("position").count) / 3, triangleCost(kind, detail), `${kind}:${detail}`);
    geometry.dispose();
  }
});
test("full tags are for near/recent/arriving/focused citizens; speech wins collisions", () => {
  assert.equal(citizenLabelMode(30, 31_000, 9000, false), "quiet");
  for (const [distance, spoke, arrived, focus] of [[10, 50_000, 9000, false], [30, 1000, 9000, false], [30, 50_000, 1000, false], [30, 50_000, 9000, true]] as const) assert.equal(citizenLabelMode(distance, spoke, arrived, focus), "tag");
  const tag: LabelCandidate = { id: "tag", x: 800, y: 500, width: 160, height: 26, priority: 100, kind: "tag", opacity: 1 };
  const speech = { ...tag, id: "speech", width: 200, height: 82, priority: 2000, kind: "speech" as const };
  assert.deepEqual([...packLabels([tag, speech])], ["speech"]);
  const crowd = Array.from({ length: 80 }, (_, i) => ({ ...tag, id: `citizen${i}`, x: 500 + (i % 10) * 55, y: 250 + Math.floor(i / 10) * 32 }));
  assert.ok(packLabels(crowd).size <= 22);
});
test("60s user and 5s global limits, failure replies, receipts and moderator clear", async () => {
  let now = 0; const records: SummonJob[] = [];
  const pipeline = new WorldPipeline(() => now);
  const service = new SummonService({ provider: fixtureProvider, mode: "fixture", config, now: () => now, record: job => { records.push(job); }, publish: event => pipeline.publish(event), reply() {} });
  pipeline.attachSummon(service);
  const chat = (id: string, user = "one", text = "!summon jellyfish") => ({ id, userId: user, displayName: user, color: "#79D7CF", text, timestamp: now });
  assert.equal((await service.submit(chat("a"))).status, "awaiting-render");
  assert.equal((await service.submit(chat("b"))).reason, "user-cooldown");
  assert.equal((await service.submit(chat("c", "two"))).reason, "global-cooldown");
  now = 5000; assert.equal((await service.submit(chat("d", "two"))).status, "awaiting-render");
  assert.equal(await service.acknowledge("d", "forged"), false);
  const scene = service.active().at(-1)!; now = 5300;
  assert.equal(await service.acknowledge(scene.id, scene.receipt), true); assert.equal(service.status(scene.id)!.latencyMs, 300);
  assert.equal(await service.acknowledge(scene.id, scene.receipt), true);
  assert.equal(pipeline.chat(chat("clear-no", "outsider", "!clear")).reason, "moderator-only");
  pipeline.chat(chat("clear-yes", "mod", "!clear"), { moderator: true });
  assert.equal(service.active().length, 1);
  now = 60_000; assert.equal((await service.submit(chat("e"))).status, "awaiting-render");
  assert.ok(records.length > 0);
});
test("missing key never silently falls back to fixtures; provider errors contain no raw body", async () => {
  await assert.rejects(() => bedrockProvider(config).generate("jellyfish"), (error: unknown) => error instanceof SummonError && error.code === "missing-key");
  await assert.rejects(() => bedrockProvider({ ...config, key: "fake-test-key" }, async () => new Response("secret error body", { status: 401 })).generate("jellyfish"), (e: unknown) => e instanceof SummonError && !e.message.includes("secret"));
  assert.equal((await fixtureProvider.generate("jellyfish")).usage.total, 0);
});
test("Bedrock uses Responses structured schema, configurable settings and parsed token usage", async () => {
  const spec = fixtureFor("crystals");
  const provider = bedrockProvider({ model: "openai.gpt-6.1-sol", effort: "max", tier: "ultrafast", key: "fake-test-key" }, async (url, init) => {
    assert.equal(url, "https://bedrock-mantle.us-east-1.api.aws/openai/v1/responses");
    const body = JSON.parse(init!.body as string);
    assert.equal(body.model, config.model); assert.equal(body.reasoning.effort, "max"); assert.equal(body.service_tier, "ultrafast");
    assert.equal(body.text.format.type, "json_schema"); assert.equal(body.text.format.strict, true); assert.ok(body.max_output_tokens > 0); assert.equal(body.store, false);
    assert.deepEqual(body.text.format.schema, responseSchema());
    return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(spec) }] }],
      usage: { input_tokens: 100, output_tokens: 200, total_tokens: 300, output_tokens_details: { reasoning_tokens: 50 }, input_tokens_details: { cached_tokens: 10 } } });
  });
  const result = await provider.generate("an amber crystal");
  assert.deepEqual(result.usage, { input: 100, output: 200, total: 300, reasoning: 50, cached: 10 });
  assert.doesNotThrow(() => normalizeSceneSpec(result.json));
});
test("refusals, truncated output and tool calls fail closed while retaining usage", async () => {
  for (const response of [
    { status: "incomplete", output: [] },
    { status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "unsafe" }] }] },
    { status: "completed", output: [{ type: "function_call", name: "execute" }] },
  ]) {
    const provider = bedrockProvider({ ...config, key: "fake" }, async () => Response.json({ ...response, usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 } }));
    await assert.rejects(() => provider.generate("shape"), (e: unknown) => e instanceof SummonError && e.usage?.total === 30);
  }
});

test("materializer allocates atomically, runs behaviors, shares global caps and disposes on clear", () => {
  const root = new Group(), ledger = new ResourceLedger(); let effects = 0, focuses = 0;
  const materializer = new SpecMaterializer({ root, ledger, layout: new LabelManager(), labels: {} as HTMLElement,
    effects: { play() { effects++; } }, camera: { focus() { focuses++; } }, citizens: { get: () => undefined, list: () => [] } });
  const spec = normalizeSceneSpec(JSON.stringify(fixtureFor("crystals"))).spec;
  const handle = materializer.spawn(spec);
  assert.equal(materializer.count, 1); assert.equal(root.children.length, 1); assert.equal(effects, 1); assert.equal(focuses, 1);
  const object = root.children[0]!.children[0]!; const before = object.position.clone();
  materializer.update(0.05, new PerspectiveCamera(), false);
  assert.ok(object.position.distanceTo(before) > 0);
  handle.dispose(); handle.dispose(); assert.equal(root.children.length, 0); assert.equal(materializer.count, 0);
  // A second full reservation succeeds after cleanup, proving the ledger was released.
  const second = materializer.spawn(spec); second.dispose(); materializer.dispose();
});

test("all behavior kinds stay bounded and missing citizen targets idle safely", () => {
  const root = new Group(), camera = new PerspectiveCamera();
  let present = true;
  const materializer = new SpecMaterializer({ root, ledger: new ResourceLedger(), layout: new LabelManager(), labels: {} as HTMLElement,
    effects: { play() {} }, camera: { focus() {} }, citizens: {
      get: () => present ? { id: "moss", displayName: "Moss", color: "#ffffff", position: new Vector3(-2.3, 6, 1.5) } : undefined, list: () => [],
    } });
  for (const kind of ["float", "orbit", "wander", "pulse", "follow-citizen", "flee"] as const) {
    const spec = normalizeSceneSpec(JSON.stringify(fixtureFor("jellyfish"))).spec;
    spec.behaviors = [{ id: "testBehavior", kind, targetId: "crown", speed: 1, amplitude: 0.2, radius: 1,
      ...(["follow-citizen", "flee"].includes(kind) ? { citizenId: "moss" } : {}) }];
    const handle = materializer.spawn(spec); const node = root.children.at(-1)!.children[0]!;
    materializer.update(0.05, camera, false);
    assert.ok(node.position.toArray().every(Number.isFinite));
    assert.ok(node.position.x >= -64 && node.position.x <= 64 && node.position.y >= -8 && node.position.y <= 48);
    present = false; materializer.update(0.05, camera, false); present = true;
    handle.dispose();
  }
});

test("unobserved scenes have null latency; late receipts update metrics without inventing provider tokens", async () => {
  let now = 0; const records: SummonJob[] = [];
  const service = new SummonService({ provider: fixtureProvider, mode: "fixture", config, now: () => now, publish() {}, reply() {}, record: job => { records.push(job); } });
  await service.submit({ id: "late", userId: "late", displayName: "Late", color: "#ffffff", text: "!summon jellyfish", timestamp: now });
  const scene = service.active()[0]!;
  now = 31_000; service.prune(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(service.status(scene.id)!.latencyMs, null);
  now = 40_000; await service.acknowledge(scene.id, scene.receipt);
  assert.equal(service.status(scene.id)!.latencyMs, 40_000); assert.equal(service.status(scene.id)!.reason, null);
  assert.equal(records.at(-1)!.usage!.total, 0);
});
test("reservation charges in-flight worst case, evicts FIFO before provider, commits and releases", async () => {
  const { SummonReservations, WORST_SPEC, emptyUsage } = await import("../world/shared/limits.js");
  const evicted: string[] = [], pool = new SummonReservations(id => evicted.push(id));
  assert.equal(pool.reserve("a"),true); assert.deepEqual(pool.usage(),WORST_SPEC);
  assert.equal(pool.reserve("b"),false,"Pending worst-case reservations cannot be evicted");
  pool.commit("a",{...emptyUsage(),triangles:15000});assert.equal(pool.reserve("b"),true);
  pool.commit("b",{...emptyUsage(),triangles:15000});assert.equal(pool.reserve("c"),true);assert.deepEqual(evicted,["a"]);
  pool.release("c");assert.equal(pool.usage().triangles,15000);pool.release("b");assert.equal(pool.size,0);
});
test("render timeout is an observation metric; secondary render failures never remove scenes", async () => {
 let now=0,replies=0;const service=new SummonService({provider:fixtureProvider,mode:"fixture",config,now:()=>now,publish(){},reply(){replies++},record(){}});
 await service.submit({id:"metric",userId:"metric",displayName:"M",color:"#ffffff",text:"!summon jellyfish",timestamp:now});
 const scene=service.active()[0]!;assert.equal(await service.acknowledge(scene.id,scene.receipt,"capacity",false),false);assert.equal(service.active().length,1);
 now=31000;service.prune();await new Promise(r=>setImmediate(r));assert.equal(service.status(scene.id)!.status,"awaiting-render");assert.equal(service.status(scene.id)!.renderTimedOut,true);assert.equal(replies,0);
});
test("every recipe's server usage matches the independent client ledger", () => {
 for(const kind of ["box","sphere","cylinder","cone","torus","plane","crystal","mushroom","tree"] as const){
  const spec=structuredClone(fixtureFor("crystals")) as SceneSpec;spec.geometries[0]!.kind=kind;spec.nodes=spec.nodes.filter(n=>n.geometryId===spec.geometries[0]!.id);spec.behaviors=[];
  const root=new Group();const materializer=new SpecMaterializer({root,ledger:new ResourceLedger(),layout:new LabelManager(),labels:{} as HTMLElement,effects:{play(){}},camera:{focus(){}},citizens:{get:()=>undefined,list:()=>[]}});
  const handle=materializer.spawn(normalizeSceneSpec(JSON.stringify(spec)).spec);assert.deepEqual(handle.usage,specUsage(spec),kind);handle.dispose();
 }
});
test("service evicts FIFO before a paid provider call and releases failed reservations", async () => {
 let now=0,calls=0,fail=false;const events:string[]=[];
 const spec=normalizeSceneSpec(JSON.stringify(fixtureFor("crystals"))).spec;spec.nodes=spec.nodes.slice(0,1);spec.lights=[];spec.emitters=[];spec.behaviors=[];
 const service=new SummonService({config,now:()=>now,mode:"live",provider:{async generate(){events.push(`provider:${++calls}`);if(fail)throw new SummonError("provider-unavailable");return{json:JSON.stringify(spec),usage:zeroUsage()};}},publish(e){if(e.type==="summon-remove")events.push(`evicted:${e.ids[0]}`);},reply(){},record(){}});
 const submit=(i:number)=>{now+=60000;return service.submit({id:`fifo-${i}`,userId:`fifo-${i}`,displayName:`Fifo${i}`,color:"#ffffff",text:"!summon crystal",timestamp:now});};
 for(let i=0;i<24;i++)assert.equal((await submit(i)).status,"awaiting-render");
 events.length=0;await submit(24);assert.deepEqual(events,["evicted:fifo-0","provider:25"]);assert.equal(service.active().length,24);assert.equal(service.active()[0]?.id,"fifo-1");
 fail=true;assert.equal((await submit(25)).status,"failed");assert.equal(service.active().length,23);
 fail=false;assert.equal((await submit(26)).status,"awaiting-render");assert.equal(service.active().length,24);
});
test("typed primary render failures produce the final failed metric without a misleading clear record", async () => {
 const records:SummonJob[]=[];const service=new SummonService({config,provider:fixtureProvider,mode:"fixture",publish(){},reply(){},record(job){records.push(job)}});
 await service.submit({id:"primary-error",userId:"primary-error",displayName:"Primary",color:"#ffffff",text:"!summon jellyfish",timestamp:0});const scene=service.active()[0]!;
 assert.equal(await service.acknowledge(scene.id,scene.receipt,"allocation",true),true);assert.equal(service.active().length,0);assert.equal(records.length,1);assert.equal(records[0]!.status,"failed");assert.equal(records[0]!.reason,"allocation");
});

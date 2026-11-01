import {BUILD_TIMEOUT_MS} from '../server/runner/codex.js';
import assert from "node:assert/strict";
import { test } from "node:test";
import type { GuardResult } from "../server/guard/index.js";
import { Rounds, ROUND_MS, normalizeIdea, similarIdeas } from "../server/rounds/index.js";
import { WorldPipeline } from "../server/pipeline.js";
import { createWorldServer } from "../server/http.js";
import type { ChatEvent } from "../server/contracts.js";
import type { RoundState } from "../server/rounds/types.js";
let serial = 0;
const chat = (userId: string, text: string): ChatEvent => ({ id: `round-event-${++serial}`, userId, displayName: userId, text, color: "#ABCDEF", timestamp: 0 });
function harness(allow = false) {
  let time = 0; const states: RoundState[] = [];
  const review = (): GuardResult => ({ verdict: "accept", reason: "Unit fixture", title: "Small module", spec: { moduleId: "unit", description: "Small local visual", steps: ["One module"], checks: ["Cleanup"], estimatedSeconds: 90 }, files: ["world/modules/unit.ts"], latencyMs: 0, mode: "fixture" });
  let finish!: (result: import("../server/runner/index.js").RunResult) => void;
  const rounds = new Rounds({ build: () => new Promise(resolve => { finish = resolve; }), review, now: () => time, publish: state => states.push(state), simulationAllowed: allow });
  return { rounds, states, async complete(ok: boolean) { finish({ ok, outcome: ok ? "SHIPPED" : "REVERTED", reason: ok ? "Checks passed" : "Candidate check failed", durationMs: 10, tokens: { input: 1, output: 2, total: 3 }, ...(ok ? { version: 1, tag: "v1" } : {}) }); await new Promise(resolve => setImmediate(resolve)); }, advance(ms: number) { time += ms; rounds.tick(); }, time: () => time };
}
function choices(rounds: Rounds) {
  rounds.command(chat("Moss", "!idea Grow a lantern orchard"));
  rounds.command(chat("Fern", "!idea Build a cloud observatory"));
  rounds.command(chat("Wisp", "!idea Tiny creatures race together"));
}
test("production rounds use exact windows and finish only when the runner reports its checked result", async () => {
  const h = harness(), r = h.rounds; choices(r);
  assert.equal(r.snapshot().endsAt, 120_000); h.advance(119_999); assert.equal(r.snapshot().phase, "ideas");
  h.advance(1); assert.equal(r.snapshot().phase, "voting"); assert.equal(r.snapshot().endsAt, 165_000);
  r.command(chat("voter", "!vote 2")); h.advance(45_000);
  assert.equal(r.snapshot().phase, "building"); assert.equal(r.snapshot().endsAt - r.snapshot().startedAt, BUILD_TIMEOUT_MS);
  assert.equal(r.snapshot().winner?.requester, "Fern"); r.feed("edit", "Edited world/modules/unit.ts"); r.feed("check", "Independent checks running");
  assert.equal(r.snapshot().build.lines.length, 2);
  await h.complete(true); const s = r.snapshot(); assert.equal(s.phase, "ideas"); assert.equal(s.timeline[0]?.version, 1);
 assert.equal(s.timeline[0]?.requester, "Fern");
});
test("near-identical ideas coalesce with original attribution and distinct backers", () => {
  const r = harness().rounds;
  for (const [user, text] of [["Moss", "Add a lantern orchard"], ["Fern", "Please add a lantern orchard!"], ["Wisp", "add a lantern orchrd"], ["Moss", "A lantern orchard"]])
    assert.equal(r.command(chat(user!, `!idea ${text}`)).accepted, true);
  const s = r.snapshot(); assert.equal(s.totalIdeas, 1); assert.equal(s.ideas[0]?.supporters, 3); assert.equal(s.ideas[0]?.requester, "Moss");
  assert.equal(similarIdeas(normalizeIdea("3 little moons"), normalizeIdea("4 little moons")), false);
  assert.equal(similarIdeas(normalizeIdea("Grow a lantern orchard"), normalizeIdea("Grow a waterfall")), false);
});
test("a later idea replaces support; top three rank by unique backers then earliest arrival", () => {
  const r = harness().rounds; choices(r);
  r.command(chat("new", "!idea A lantern orchard"));
  r.command(chat("new", "!idea Build a cloud observatory"));
  r.command(chat("fourth", "!idea Rainbow fireflies")); r.skip();
  assert.deepEqual(r.snapshot().candidates.map(c => c.requester), ["Fern", "Moss", "Wisp"]);
  assert.equal(r.snapshot().totalIdeas, 4);
});
test("each user's later ballot replaces the earlier one, and ties use earliest idea rather than shortlist position", () => {
  const r = harness().rounds; choices(r);
  r.command(chat("supporter", "!idea Build a cloud observatory")); r.skip();
  assert.equal(r.snapshot().candidates[0]?.requester, "Fern");
  r.command(chat("voter1", "!vote 1")); r.command(chat("voter2", "!vote 2"));
  r.command(chat("voter3", "!vote 1")); r.command(chat("voter3", "!vote 2")); r.command(chat("voter3", "!vote 3"));
  assert.equal(r.snapshot().totalVotes, 3); assert.deepEqual(r.snapshot().candidates.map(c => c.votes), [1, 1, 1]);
  r.skip(); assert.equal(r.snapshot().winner?.requester, "Moss");
});
test("invalid/late commands and abusive wishes are rejected; snapshots cannot mutate authoritative state", () => {
  const r = harness().rounds;
  for (const text of ["!idea", `!idea ${"x".repeat(181)}`, "!vote 1", "!vote 4"]) assert.equal(r.command(chat("u", text)).accepted, false, text);
  r.command(chat("Moss", "!idea A gentle moon")); const snapshot = r.snapshot(); snapshot.ideas[0]!.text = "changed";
  assert.equal(r.snapshot().ideas[0]?.text, "A gentle moon"); r.skip();
  assert.equal(r.command(chat("u", "!idea Too late")).reason, "ideas-closed");
  assert.equal(r.command(chat("u", "!vote 2")).reason, "invalid-option");
});
test("pause freezes countdown/progress, resume preserves remaining time, empty rounds recover", () => {
  const h = harness(), r = h.rounds; h.advance(30_000); r.setPaused(true);
  h.advance(500_000); assert.equal(r.snapshot().now, 30_000); assert.equal(r.snapshot().phase, "ideas");
  assert.equal(r.command(chat("u", "!idea A comet")).reason, "round-paused");
  r.setPaused(false); h.advance(89_999); assert.equal(r.snapshot().phase, "ideas");
  h.advance(1); assert.equal(r.snapshot().round, 2); assert.equal(r.snapshot().phase, "ideas");
});
test("rehearsals accelerate collection/voting but use real-time runner deadlines and preserve a failed version", async () => {
  const h = harness(true), r = h.rounds; r.startSimulation("ship"); choices(r); h.advance(8000); assert.equal(r.snapshot().phase,"voting");
  h.advance(3000); assert.equal(r.snapshot().phase,"building"); assert.equal(r.snapshot().clockRate,1); await h.complete(true);
  r.startSimulation("fail"); choices(r); h.advance(8000); h.advance(3000); await h.complete(false);
  assert.equal(r.snapshot().timeline.at(-1)?.kind,"revert"); assert.equal(r.snapshot().timeline.at(-1)?.version,1);
  assert.equal(harness().rounds.startSimulation("ship").reason,"simulation-disabled");
});
test("runner is cancelled at its configured build deadline and moderator skip fails safely", () => {
  const h = harness(true), r = h.rounds; r.startSimulation("timeout"); choices(r); h.advance(8000); h.advance(3000);
  h.advance(BUILD_TIMEOUT_MS-1); assert.equal(r.snapshot().phase,"building"); h.advance(1); assert.equal(r.snapshot().phase,"ideas");
  assert.ok(r.snapshot().timeline[0]!.reason.includes(`${BUILD_TIMEOUT_MS/1000}-second`)); choices(r); r.skip(); r.skip(); r.skip(); assert.match(r.snapshot().timeline.at(-1)!.reason,/moderator/);
});
test("idea, vote, timeline and toast buffers are bounded", () => {
  const r = harness().rounds;
  for (let i = 0; i < 100; i++) assert.equal(r.command(chat(`u${i}`, `!idea Moon number ${i}`)).accepted, true);
  assert.equal(r.command(chat("overflow", "!idea A unique waterfall")).reason, "idea-capacity");
  assert.equal(r.snapshot().ideas.length, 8); r.skip(); assert.equal(r.snapshot().candidates.length, 3);
  for (let i = 0; i < 5000; i++) assert.equal(r.command(chat(`v${i}`, "!vote 1")).accepted, true);
  assert.equal(r.command(chat("overflow", "!vote 1")).reason, "vote-capacity");
  assert.equal(r.command(chat("v0", "!vote 2")).accepted, true);
  for (let i = 0; i < 30; i++) r.toast("notice", "x".repeat(200), "y".repeat(200));
  assert.equal(r.snapshot().toasts.length, 8); assert.equal(r.snapshot().toasts[0]?.title.length, 80);
});
test("shared chat pipeline routes round commands and verified mod controls, even with the citizen cap full", () => {
  let now = 0; const p = new WorldPipeline(() => now); const r = new Rounds({ now: () => now, publish: state => p.publish({ type: "rounds", state }) }); p.attachRounds(r);
  for (let i = 0; i < 300; i++) { now += 250; p.chat(chat(`c${i}`, "hello")); }
  assert.equal(p.roster.size, 300); assert.equal(p.chat(chat("outside", "!idea A gentle comet")).accepted, true);
  assert.equal(r.snapshot().totalIdeas, 1);
  assert.equal(p.chat(chat("fake", "!skip")).reason, "moderator-only");
  p.chat(chat("mod", "!skip"), { moderator: true }); assert.equal(r.snapshot().phase, "voting");
  now += 250; assert.equal(p.chat(chat("outside", "!vote 1")).accepted, true);
  p.chat(chat("mod", "!pause"), { moderator: true }); assert.equal(r.snapshot().paused, true);
  now += 250;
  p.chat(chat("mod", "!pause"), { moderator: true });
  assert.equal(p.chat(chat("bad", "!vote 4")).reason, "invalid-round-command");
  assert.equal(p.chat(chat("bad", "!vote 1")).reason, "rate-limited", "invalid commands still consume the shared chat rate budget");
  assert.ok(p.snapshot().rounds); assert.ok(p.snapshot().rounds!.toasts.some(t => t.kind === "citizens"));
});
test("HTTP rehearsal requires offline enablement, valid JSON/outcome and same origin; state is available to late viewers", async () => {
  const p = new WorldPipeline(), r = new Rounds({ publish: state => p.publish({ type: "rounds", state }) }); p.attachRounds(r);
  const app = await createWorldServer(p, undefined, r, undefined, {live:false,simulationAllowed:true,async fault(){}}); await new Promise<void>(resolve => app.server.listen(0, "127.0.0.1", resolve));
  const address = app.server.address() as { port: number }, base = `http://127.0.0.1:${address.port}`;
  try {
    const post = (value: unknown, origin?: string) => fetch(`${base}/sim/round`, { method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(value) });
    assert.equal((await post({ outcome: "ship" })).status, 403);
    assert.equal((await post({ outcome: "magic" })).status, 400);
    assert.equal((await post({ outcome: ["ship"] })).status, 400);
    assert.equal((await post({ outcome: "ship" }, "http://evil.example")).status, 403);
    const state = await (await fetch(`${base}/api/rounds`)).json() as RoundState; assert.equal(state.phase, "ideas");
    const snapshot = await (await fetch(`${base}/api/world`)).json() as { rounds: RoundState }; assert.equal(snapshot.rounds.endsAt - snapshot.rounds.startedAt, ROUND_MS.ideas);
  } finally { app.closeStreams(); await new Promise<void>(resolve => app.server.close(() => resolve())); }
});
test("idle countdowns do not broadcast each second and published views do not mutate rounds", () => {
 const h=harness();h.rounds.tick();const count=h.states.length;h.advance(5000);assert.equal(h.states.length,count);
 choices(h.rounds);h.advance(100);const state=h.states.at(-1)!;state.build.lines.push({id:999,kind:"error",text:"mutated"});assert.ok(!h.rounds.snapshot().build.lines.some(l=>l.id===999));
});
test("simulation timing never rewrites the guard-approved spec", async () => {
 let now=0;const approved:GuardResult={verdict:"accept",title:"Orchard",reason:"Safe",spec:{moduleId:"orchard",description:"A small original orchard",steps:["Plant"],checks:["Cleanup"],estimatedSeconds:60},files:["world/modules/orchard.ts"],mode:"fixture",latencyMs:0};
 let description="";const r=new Rounds({now:()=>now,publish(){},simulationAllowed:true,review:()=>approved,build:async request=>{description=request.decision.spec!.description;return{ok:false,outcome:"REVERTED",reason:"Unit",durationMs:0,tokens:{input:0,output:0,total:0}}}});
 r.startSimulation("fail");r.command(chat("viewer","!idea Original orchard"));now=11000;r.tick();await new Promise(r=>setImmediate(r));assert.equal(description,"A small original orchard");assert.equal(approved.spec!.description,description);r.dispose();
});

test("shipped timeline and toast use the approved title while queue/build keep the viewer's proposal",async()=>{
 const h=harness(),r=h.rounds,raw='Race game: typing !race joins a tiny island race';r.command(chat('Racer',`!idea ${raw}`));r.skip();r.skip();assert.equal(r.snapshot().build.idea,raw);await h.complete(true);
 assert.equal(r.snapshot().timeline.at(-1)?.title,'Small module');assert.equal(r.snapshot().timeline.at(-1)?.requester,'Racer');assert.ok(r.snapshot().toasts.at(-1)?.detail.includes('Small module'));assert.equal(r.snapshot().build.idea,raw);
});

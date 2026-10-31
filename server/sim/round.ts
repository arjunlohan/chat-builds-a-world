import { setTimeout as delay } from "node:timers/promises";
import type { RoundState, StubOutcome } from "../rounds/types.js";
import { simChatter } from "./scenario.js";

export async function scriptedRound(base: string, run: string, outcome: StubOutcome) {
  async function post(path: string, value: unknown) {
    const response = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value), signal: AbortSignal.timeout(5000) });
    const result = await response.json() as { accepted: boolean };
    if (!response.ok || !result.accepted) throw new Error("Round rehearsal event rejected");
  }
  async function state() { return await (await fetch(`${base}/api/rounds`, { signal: AbortSignal.timeout(5000) })).json() as RoundState; }
  async function wait(test: (value: RoundState) => boolean, timeout = 25_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { const value = await state(); if (test(value)) return value; await delay(100); }
    throw new Error("Round rehearsal deadline exceeded");
  }
  let serial = 0;
  const chat = async (i: number, text: string) => {
    await post("/sim/chat", { ...simChatter(i), id: `sim-${run}-round-${serial++}`, text }); await delay(90);
  };
  const before = await state(), previous = before.timeline.at(-1)?.id ?? 0;
  await post("/sim/round", { outcome });
  // The last fixture requester is also a proposer; respect the shared 250 ms chat gate.
  await delay(300);
  const ideas: [number, string][] = [
    [0, "Give the island a day and night cycle"], [1, "Please give the island a day and night cycle!"], [2, "A day and night cycle"],
    [3, "Grow a lantern orchard by the lake"], [6, "Please grow a lantern orchard by the lake!"],
    [4, "Add a tiny race around the island"], [5, "Put a cloud observatory on the ridge"],
  ];
  for (const [i, idea] of ideas) await chat(i, `!idea ${idea}`);
  const queued = await state();
  if (queued.totalIdeas !== 4 || queued.ideas[0]?.supporters !== 3) throw new Error("Idea deduplication mismatch");
  await wait(s => s.phase === "voting");
  const ballot = [1, 1, 2, 2, 2, 2, 2, 2, 2, 3, 3, 2];
  for (let i = 0; i < ballot.length; i++) await chat(i, `!vote ${ballot[i]}`);
  await chat(0, "!vote 2");
  const voted = await state();
  if (voted.totalVotes !== 12 || voted.candidates.map(c => c.votes).join() !== "1,9,2") throw new Error("Vote replacement mismatch");
  const building = await wait(s => s.phase === "building");
  if (building.winner?.requester !== "Comet04") throw new Error("Wrong winning requester");
  const done = await wait(s => (s.timeline.at(-1)?.id ?? 0) > previous);
  const result = done.timeline.at(-1)!;
  if (result.kind !== (outcome === "ship" ? "ship" : "revert") || result.requester !== "Comet04") throw new Error("Stub build result mismatch");
  console.log(`Round rehearsal: 7 proposals → 4 distinct ideas → 3 candidates; 13 ballots → 12 voters [1,9,2]; ${outcome === "ship" ? `stub shipped v${result.version}` : `stub ${outcome}, retained v${result.version}`} for ${result.requester}. Timings 120/45/180 s at 15×.`);
}

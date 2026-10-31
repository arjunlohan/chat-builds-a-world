import { parseArgs } from "node:util";
import { readConfig } from "../config.js";
import { config as loadEnv } from "dotenv";
import { setTimeout as delay } from "node:timers/promises";
import { scriptedRound } from "./round.js";
import type { SimulationOutcome } from "../rounds/types.js";
import { crowdScenario, SIM_CROWD } from "./scenario.js";

const {values}=parseArgs({options:{"round-only":{type:"boolean",default:false},"crowd-only":{type:"boolean",default:false},outcome:{type:"string",default:"ship"}}});
loadEnv({ quiet: true });
const port = readConfig().port;
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
const base = `http://127.0.0.1:${port}`;
let accepted = 0;
try {
  const run = Date.now().toString(36);
  if (!values["round-only"]) {
    for (const step of crowdScenario(run)) {
      const response = await fetch(`${base}/sim/${step.kind}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(step.event), signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("Simulator endpoint rejected the event");
      const result = await response.json() as { accepted: boolean };
      if (!result.accepted) throw new Error("Simulator event was not admitted; restart dev for an empty world");
      accepted++;
      await delay(step.delay);
    }
    for (let i = 0; !values["crowd-only"] && i < 3; i++) {
      if (i) await delay(5100);
      const wish = ["a glowing jellyfish above the lake", "a rose mushroom grove", "an orbit of amber crystals"][i]!;
      const event = { id: `sim-${run}-summon-${i}`, userId: `sim-viewer-${i}`, displayName: ["Moss01", "Pebble02", "Clover03"][i], color: ["#E9A18E", "#79D7CF", "#9FB3E7"][i], text: `!summon ${wish}` };
      const response = await fetch(`${base}/sim/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event) });
      if (!response.ok || !(await response.json() as { accepted: boolean }).accepted) throw new Error("Fixture summon was rejected");
      let valid = false;
      for (let poll = 0; poll < 50; poll++) {
        const job = await (await fetch(`${base}/api/summons/${event.id}`)).json() as { status: string; valid: boolean };
        if (job.status !== "generating") { valid = job.valid && ["awaiting-render", "rendered"].includes(job.status); break; }
        await delay(100);
      }
      if (!valid) throw new Error("Fixture summon failed validation or cooldown");
      accepted++;
    }
  }
  const outcome = values.outcome;
  if (!["ship", "fail", "timeout"].includes(outcome)) throw new Error("Unknown simulation outcome");
  if(!values["crowd-only"]){await scriptedRound(base, run, outcome as SimulationOutcome);accepted += 20;}
  const response = await fetch(`${base}/api/world`);
  const world = await response.json() as { citizens: { id: string }[]; raids: number; summons: unknown[] };
  const count = world.citizens.filter(c => c.id.startsWith("sim-viewer-")).length;
  if (!values["round-only"] && count !== SIM_CROWD) throw new Error("Crowd count mismatch");
  console.log(`Simulator: ${accepted} events accepted, ${count}/${SIM_CROWD} scripted citizens, ${world.citizens.length} total citizens, ${world.raids} raid event(s), ${world.summons.length} fixture summons.`);
} catch {
  console.error(`Simulator could not complete. Start pnpm dev on port ${port}; use an unpaused, empty idea round with capacity for 80 chatters plus 24 raiders. Rehearsals require sim-only mode.`);
  process.exitCode = 1;
}

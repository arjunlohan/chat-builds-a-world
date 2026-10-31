import { config as loadEnv } from "dotenv";
import { setTimeout as delay } from "node:timers/promises";
import { crowdScenario, SIM_CROWD } from "./scenario.js";

loadEnv({ quiet: true });
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
const base = `http://127.0.0.1:${port}`;
let accepted = 0;
try {
  const run = Date.now().toString(36);
  for (const step of crowdScenario(run)) {
    const response = await fetch(`${base}/sim/${step.kind}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(step.event), signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("Simulator endpoint rejected the event");
    const result = await response.json() as { accepted: boolean };
    if (!result.accepted) throw new Error("Simulator event was not admitted; restart dev for an empty world");
    accepted++;
    await delay(step.delay);
  }
  const response = await fetch(`${base}/api/world`);
  const world = await response.json() as { citizens: { id: string }[]; raids: number };
  const count = world.citizens.filter(c => c.id.startsWith("sim-viewer-")).length;
  if (count !== SIM_CROWD) throw new Error("Crowd count mismatch");
  console.log(`Simulator: ${accepted} events accepted, ${count}/${SIM_CROWD} scripted citizens, ${world.citizens.length} total citizens, ${world.raids} raid event(s).`);
} catch {
  console.error(`Simulator could not complete. Start pnpm dev on port ${port}; use an unpaused world with capacity for 80 citizens.`);
  process.exitCode = 1;
}

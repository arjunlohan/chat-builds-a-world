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
  for (let i = 0; i < 3; i++) {
    if (i) await delay(5100);
    const wish = ["a glowing jellyfish above the lake", "a rose mushroom grove", "an orbit of amber crystals"][i]!;
    const event = { id: `sim-${run}-summon-${i}`, userId: `sim-viewer-${i}`, displayName: ["Moss01", "Pebble02", "Clover03"][i], color: ["#E9A18E", "#79D7CF", "#9FB3E7"][i], text: `!summon ${wish}`, fixture: true };
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
  const response = await fetch(`${base}/api/world`);
  const world = await response.json() as { citizens: { id: string }[]; raids: number; summons: unknown[] };
  const count = world.citizens.filter(c => c.id.startsWith("sim-viewer-")).length;
  if (count !== SIM_CROWD) throw new Error("Crowd count mismatch");
  console.log(`Simulator: ${accepted} events accepted, ${count}/${SIM_CROWD} scripted citizens, ${world.citizens.length} total citizens, ${world.raids} raid event(s), ${world.summons.length} fixture summons.`);
} catch {
  console.error(`Simulator could not complete. Start pnpm dev on port ${port}; use an unpaused world with capacity for 80 citizens.`);
  process.exitCode = 1;
}

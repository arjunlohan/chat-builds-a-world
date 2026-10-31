import { chromium } from "@playwright/test";
import { setTimeout as delay } from "node:timers/promises";
import { readConfig } from "../config.js";
import type { SummonJob } from "./index.js";

const prompts = ["a glowing jellyfish above the lake", "three rose mushrooms", "an amber crystal mobile", "a fern arch", "a floating jade lantern", "a tiny coral tree", "a ring of golden pebbles", "a blue geometric butterfly", "a mint spiral of spheres", "a small moon garden", "a pink crystal flower", "an arch of pale stone", "a little floating cloud", "a glowing origami-like bird of triangles", "a ring of fireflies", "a mushroom umbrella", "a silver-green sprout", "a warm amber orb", "a tiny sculpture of waves", "an original lantern to celebrate this world"];
async function main() {
  const config = readConfig();
  if (!config.summon.key) { console.error("AWS_BEARER_TOKEN_BEDROCK is missing; no live benchmark requests were sent."); process.exitCode = 1; return; }
  const base = `http://127.0.0.1:${config.port}`;
  const snapshot = await (await fetch(`${base}/api/world`)).json() as { summons: unknown[] };
  if (snapshot.summons.length) throw new Error("Start a fresh dev server before benchmarking");
  const browser = await chromium.launch({ headless: true, args: process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : ["--enable-gpu"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`${base}/world?debug=1`); await page.waitForSelector("canvas[data-ready='true']", { timeout: 60_000 });
    console.log("# | mode | valid | status | provider ms | request-to-screen ms | input/output/total/reasoning tokens");
    const run = Date.now().toString(36); let previous = -Infinity;
    for (let i = 0; i < prompts.length; i++) {
      await delay(Math.max(0, previous + 5100 - Date.now())); previous = Date.now();
      const id = `bench-${run}-${i}`;
      const response = await fetch(`${base}/sim/chat`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, userId: id, displayName: `Bench${i + 1}`, color: "#79D7CF", text: `!summon ${prompts[i]}`, fixture: false }) });
      if (!response.ok || !(await response.json() as { accepted: boolean }).accepted) throw new Error("Benchmark event not admitted");
      let job: SummonJob | undefined;
      const deadline = Date.now() + 155_000;
      while (Date.now() < deadline) {
        const result = await fetch(`${base}/api/summons/${id}`);
        if (result.ok) { job = await result.json() as SummonJob; if (["rendered", "failed", "cleared"].includes(job.status)) break; }
        await delay(200);
      }
      if (!job) throw new Error("No benchmark result");
      const tokens = job.usage;
      console.log(`${i + 1} | ${job.mode} | ${job.valid} | ${job.status}${job.reason ? `:${job.reason}` : ""} | ${job.providerMs ?? "n/a"} | ${job.latencyMs ?? "not rendered"} | ${tokens?.input ?? "?"}/${tokens?.output ?? "?"}/${tokens?.total ?? "?"}/${tokens?.reasoning ?? "?"}`);
      if (job.reason === "missing-key") throw new Error("Restart dev with the Bedrock key configured");
    }
  } finally { await browser.close(); }
}
void main().catch(() => { console.error("Live benchmark could not complete. Start a fresh pnpm dev with the Bedrock key, then install Chromium if needed. No credentials were printed."); process.exitCode = 1; });

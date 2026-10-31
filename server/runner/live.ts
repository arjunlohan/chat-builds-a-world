import { config as loadEnv } from "dotenv";
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
loadEnv({ quiet: true });
if (!process.env.AWS_BEARER_TOKEN_BEDROCK?.trim()) {
  console.error("runner:live requires AWS_BEARER_TOKEN_BEDROCK. No request or Git operation was started."); process.exitCode = 1;
} else {
  const base = `http://127.0.0.1:${Number(process.env.PORT ?? 3000)}`;
  const browser = await chromium.launch({ headless: true, args: process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : ["--enable-gpu"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }); await page.goto(`${base}/world`); await page.waitForSelector('canvas[data-ready="true"]');
    const response = await fetch(`${base}/runner/live`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idea: process.argv.slice(2).join(" ") || "Add one original amber crystal that gently floats above the ridge." }) });
    if (!response.ok) throw new Error("Live round refused. Restart dev with the key, clean master and an empty idea round.");
    const { round } = await response.json() as { round: number };
    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline) {
      const state = await (await fetch(`${base}/api/rounds`)).json() as { round: number; phase: string; guard: { status: string; reason: string }; build: { status: string } };
      if (state.round > round && state.phase === "ideas") {
        if (state.guard.status === "rejected") { console.log(`Guard rejected: ${state.guard.reason}`); process.exitCode = 1; }
        else {
          const last = (await readFile("state/runner-metrics.jsonl", "utf8")).trim().split("\n").at(-1); console.log(last);
          if (state.build.status !== "shipped") process.exitCode = 1;
        }
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (Date.now() >= deadline) throw new Error("Live round exceeded its watchdog.");
  } catch { console.error("Live round did not ship; inspect the local overlay and sanitized state metrics."); process.exitCode = 1; }
  finally { await browser.close(); }
}

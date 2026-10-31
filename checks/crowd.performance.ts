import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";
import type { CitizenState } from "../server/contracts.js";

// pnpm dev must already be running. This executes the same pnpm sim a judge uses.
const browser = await chromium.launch({ headless: true,
  args: process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : ["--enable-gpu"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("http://127.0.0.1:3000/world?debug=1");
  await page.waitForSelector("canvas[data-ready='true']", { timeout: 60_000 });
  const gpu = await page.evaluate(() => {
    const gl = document.querySelector("canvas")!.getContext("webgl2")!;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "unknown";
  });
  assert.ok(!/swiftshader|llvmpipe|software|unknown/i.test(gpu), `Physical GPU required, found ${gpu}`);
  const sim = await promisify(execFile)("pnpm", ["sim"], { cwd: process.cwd(), timeout: 30_000 });
  console.log(sim.stdout.trim());
  await page.waitForFunction(() => window.__worldStats.citizenCount === 80);
  const response = await fetch("http://127.0.0.1:3000/api/world");
  const snapshot = await response.json() as { citizens: CitizenState[]; raids: number };
  assert.equal(snapshot.citizens.length, 80);
  const rendered = await page.locator(".citizen-label").evaluateAll(labels => labels.map(label => ({
    id: (label as HTMLElement).dataset.userId!, command: (label as HTMLElement).dataset.command!, color: (label as HTMLElement).dataset.color!,
  })));
  assert.deepEqual(rendered.map(c => c.id).sort(), snapshot.citizens.map(c => c.id).sort());
  assert.equal(rendered.find(c => c.id === "sim-viewer-0")!.color, "#E9A18E");
  for (const kind of ["jump", "dance", "follow", "home"]) assert.equal(rendered.filter(c => c.command === kind).length, 20);
  const bubbles = await page.locator(".citizen-bubble:visible").count();
  assert.ok(bubbles > 0 && bubbles <= 16);
  await page.screenshot({ path: "test-results/crowd-active.png" });
  await page.waitForTimeout(2500);
  const start = await page.evaluate(() => ({ frame: window.__worldStats.frame, now: performance.now() }));
  await page.waitForTimeout(15_000);
  const stats = await page.evaluate(() => ({ ...window.__worldStats, now: performance.now() }));
  const measuredFps = (stats.frame - start.frame) * 1000 / (stats.now - start.now);
  assert.equal(stats.citizenCount, 80);
  assert.equal(stats.raidCount, snapshot.raids);
  assert.ok(stats.raidCount >= 1);
  assert.ok(stats.avgFps >= 50, `Crowd rolling average ${stats.avgFps.toFixed(1)} is below 50`);
  assert.ok(measuredFps >= 50, `Crowd measured average ${measuredFps.toFixed(1)} is below 50`);
  assert.ok(stats.cameraFocuses <= 3, "Crowd caused excessive automatic camera fly-tos");
  assert.deepEqual(errors, []);
  await page.screenshot({ path: "test-results/crowd-hardware.png" });
  console.log(JSON.stringify({ gpu, resolution: "1920x1080", serverCitizens: snapshot.citizens.length,
    renderedCitizens: stats.citizenCount, visibleBubbles: bubbles, commands: "20 each: jump/dance/follow/home",
    raidCount: stats.raidCount, measuredFps, avgFps: stats.avgFps, automaticFlyTos: stats.cameraFocuses,
    consoleErrors: errors.length }, null, 2));
} finally { await browser.close(); }

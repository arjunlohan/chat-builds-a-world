import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { launchWorldPage, measureFps } from "./browser.js";
import type { CitizenState } from "../server/contracts.js";

// pnpm dev must already be running. This executes the same pnpm sim a judge uses.
const {browser,page,gpu,errors}=await launchWorldPage("http://127.0.0.1:3000","debug=1");
try {
  assert.ok(!/swiftshader|llvmpipe|software|unknown/i.test(gpu), `Physical GPU required, found ${gpu}`);
  const simRun = promisify(execFile)("pnpm", ["sim"], { cwd: process.cwd(), timeout: 100_000 });
  await page.waitForFunction(() => window.__worldStats.citizenCount === 80);
  await page.waitForTimeout(400);
  async function readableLabels() {
    return page.locator(".citizen-label:visible, .summon-label:visible, .raid-label:visible").evaluateAll(labels => {
      const rects = labels.map(label => { const r = label.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
      let overlaps = 0;
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!, b = rects[j]!;
        if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) overlaps++;
      }
      return { shown: rects.length, overlaps };
    });
  }
  const activeLabels = await readableLabels();
  assert.equal(activeLabels.overlaps, 0); assert.ok(activeLabels.shown < 40);
  await page.screenshot({ path: "test-results/crowd-readable.png" });
  await page.waitForSelector('.summon-label[data-spawn-effect="played"]:visible', { timeout: 20_000 });
  await page.screenshot({ path: "test-results/fixture-jellyfish.png" });
  const sim = await simRun; console.log(sim.stdout.trim());
  await page.waitForFunction(() => window.__worldStats.citizenCount === 104);
  const response = await fetch("http://127.0.0.1:3000/api/world");
  const snapshot = await response.json() as { citizens: CitizenState[]; raids: number; summons: { id: string }[] };
  assert.equal(snapshot.citizens.length, 104);
  const rendered = await page.locator(".citizen-label").evaluateAll(labels => labels.map(label => ({
    id: (label as HTMLElement).dataset.userId!, command: (label as HTMLElement).dataset.command!, color: (label as HTMLElement).dataset.color!,
  })));
  assert.deepEqual(rendered.map(c => c.id).sort(), snapshot.citizens.map(c => c.id).sort());
  assert.equal(rendered.find(c => c.id === "sim-viewer-0")!.color, "#E9A18E");
  for (const kind of ["jump", "dance", "follow", "home"]) assert.equal(rendered.filter(c => c.command === kind).length, 20);
  await page.waitForFunction(() => window.__worldStats.summonCount === 3);
  await page.waitForFunction(() => document.querySelectorAll('.summon-label[data-spawn-effect="played"]').length === 3, undefined, { timeout: 15_000 });
  const visibleSummons = await page.locator(".summon-label").count(); assert.equal(visibleSummons, 3);
  assert.equal(await page.locator('.summon-label[data-spawn-effect="played"]').count(), 3);
  assert.ok(await page.locator(".summon-label small").allTextContents().then(names => names.every(n => n.startsWith("by "))));
  const results = await Promise.all(snapshot.summons.map(async s => {
    for (let i = 0; i < 75; i++) {
      const job = await (await fetch(`http://127.0.0.1:3000/api/summons/${s.id}`)).json() as { status: string; latencyMs: number; usage: { total: number } };
      if (job.status === "rendered") return job;
      if (job.status === "failed") throw new Error("Fixture did not render");
      await page.waitForTimeout(200);
    }
    throw new Error("Missing browser render receipt");
  }));
  assert.ok(results.every(job => job.latencyMs >= 0 && job.usage.total === 0));
  const bubbles = await page.locator(".citizen-bubble:visible").count();
  assert.ok(bubbles <= 8);
  await page.screenshot({ path: "test-results/crowd-active.png" });
  await page.waitForTimeout(2500);
  const measurement=await measureFps(page,15000),stats=measurement.stats,measuredFps=measurement.fps;
  assert.equal(stats.citizenCount, 104);
  assert.equal(stats.raidCount, snapshot.raids);
  assert.ok(stats.raidCount >= 1);
  assert.ok(stats.avgFps >= 50, `Crowd rolling average ${stats.avgFps.toFixed(1)} is below 50`);
  assert.ok(measuredFps >= 50, `Crowd measured average ${measuredFps.toFixed(1)} is below 50`);
  assert.ok(stats.cameraFocuses <= 4, "Crowd caused excessive automatic camera fly-tos");
  assert.equal((await readableLabels()).overlaps, 0);
  assert.equal(stats.summonFocuses, 3);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: "test-results/crowd-hardware.png" });
  console.log(JSON.stringify({ gpu, resolution: "1920x1080", serverCitizens: snapshot.citizens.length,
    renderedCitizens: stats.citizenCount, visibleBubbles: bubbles, commands: "20 each: jump/dance/follow/home",
    raidCount: stats.raidCount, measuredFps, avgFps: stats.avgFps, automaticFlyTos: stats.cameraFocuses,
    consoleErrors: errors.length, labelOverlaps: activeLabels.overlaps, visibleCrowdLabels: activeLabels.shown, fixtureSummons: visibleSummons, fixtureLatencyMs: results.map(j => j.latencyMs) }, null, 2));
} finally { await browser.close(); }

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";

// Run against a fresh pnpm dev. Composite the two actual OBS sources, not a mock.
const browser = await chromium.launch({ headless: true, args: process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : ["--enable-gpu"] });
await mkdir("test-results", { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("http://127.0.0.1:3000/world?overlay=1&time=day");
  await page.waitForSelector("canvas[data-ready='true']", { timeout: 60_000 });
  assert.equal(await page.locator(".world-heading").isVisible(), false);
  assert.equal(await page.locator(".world-label").isVisible(), false);
  assert.equal(await page.locator(".world-hint").isVisible(), false);
  await page.evaluate(() => {
    const frame = document.createElement("iframe"); frame.id = "obs-overlay"; frame.title = "Transparent OBS overlay";
    Object.assign(frame.style, { position: "fixed", inset: "0", width: "1920px", height: "1080px", border: "0", pointerEvents: "none", zIndex: "50" });
    frame.src = "/overlay"; document.body.append(frame);
  });
  const frameElement = await page.waitForSelector("#obs-overlay"), overlay = (await frameElement.contentFrame())!;
  await overlay.waitForSelector(".connection.connected");
  const transparent = await overlay.evaluate(() => [document.documentElement, document.body].every(node => getComputedStyle(node).backgroundColor === "rgba(0, 0, 0, 0)"));
  assert.equal(transparent, true);
  assert.equal(await overlay.evaluate(() => getComputedStyle(document.documentElement).colorScheme), "normal");
  const start = await page.evaluate(() => ({ frame: window.__worldStats.frame, now: performance.now() }));
  let simError: unknown;
  const sim = promisify(execFile)("pnpm", ["sim"], { cwd: process.cwd(), timeout: 75_000 }).catch(error => { simError = error; return { stdout: "", stderr: "Simulator failed" }; });
  await overlay.waitForFunction(() => document.querySelectorAll(".toast.citizens").length > 0, undefined, { timeout: 15_000 });
  await page.screenshot({ path: "test-results/overlay-milestone.png" });
  await overlay.waitForFunction(() => [...document.querySelectorAll(".toast.summon")].length > 0, undefined, { timeout: 20_000 });
  await page.screenshot({ path: "test-results/overlay-summon.png" });
  await overlay.waitForFunction(() => document.querySelector(".mode")?.textContent?.includes("REHEARSAL"), undefined, { timeout: 25_000 });
  await overlay.waitForFunction(() => document.querySelectorAll(".idea").length === 4);
  await page.screenshot({ path: "test-results/overlay-ideas.png" });
  await overlay.waitForFunction(() => [...document.querySelectorAll(".vote-count")].map(n => n.textContent).join() === "1,9,2", undefined, { timeout: 15_000 });
  assert.ok((await overlay.locator(".vote-total").textContent())?.includes("12 voters"));
  await page.screenshot({ path: "test-results/overlay-voting.png" });
  await overlay.waitForFunction(() => document.querySelector(".feed-panel")?.getAttribute("data-status") === "running" && Number.parseInt(document.querySelector(".progress-number")?.textContent ?? "0") >= 50);
  assert.equal(await overlay.locator(".feed-panel h2").textContent(), "Codex is building");
  assert.ok((await overlay.locator(".build-idea").textContent())?.includes("lantern orchard"));
  assert.ok((await overlay.locator(".feed-panel .credit").textContent())?.includes("Comet04"));
  assert.ok((await overlay.locator(".feed-lines").textContent())?.includes("Simulating"));
  const layout = await overlay.evaluate(() => {
    const center = { x: 500, y: 150, right: 1420, bottom: 910 };
    const boxes = [...document.querySelectorAll<HTMLElement>(".panel:not([hidden]), .toast")].map(node => {
      const r = node.getBoundingClientRect(); return { name: node.className, x: r.x, y: r.y, right: r.right, bottom: r.bottom, clipped: node.scrollHeight > node.clientHeight + 1 };
    });
    return { boxes, centerCovered: boxes.some(r => r.x < center.right && r.right > center.x && r.y < center.bottom && r.bottom > center.y) };
  });
  assert.equal(layout.centerCovered, false); assert.ok(layout.boxes.every(b => b.right <= 1920 && b.bottom <= 1080));
  assert.deepEqual(layout.boxes.filter(b => b.clipped), [], "Overlay panel content is clipped");
  await page.screenshot({ path: "test-results/overlay-building.png" });
  const first = await sim; if (simError) throw simError; console.log(first.stdout.trim());
  await overlay.waitForSelector('.version[data-kind="ship"]');
  await overlay.waitForSelector(".toast.ship"); await page.waitForTimeout(350); await page.screenshot({ path: "test-results/overlay-shipped.png" });
  assert.ok((await overlay.locator(".version.ship .credit").textContent())?.includes("Comet04"));
  const end = await page.evaluate(() => ({ ...window.__worldStats, now: performance.now() }));
  const measuredFps = (end.frame - start.frame) * 1000 / (end.now - start.now);
  assert.equal(end.citizenCount, 80); assert.equal(end.summonCount, 3);
  assert.ok(end.avgFps >= 50); assert.ok(measuredFps >= 50);
  const failed = await promisify(execFile)("pnpm", ["sim", "--round-only", "--outcome=fail"], { cwd: process.cwd(), timeout: 35_000 }); console.log(failed.stdout.trim());
  await overlay.waitForSelector('.version[data-kind="revert"]'); await overlay.waitForSelector(".toast.revert");
  assert.equal(await overlay.locator(".version.revert .version-tag").textContent(), "↶ v1");
  assert.equal(await overlay.locator(".version.ship").count(), 1);
  assert.equal(await overlay.locator(".timeline-panel").evaluate(node => node.scrollHeight <= node.clientHeight + 1), true, "Filled timeline must fit its panel");
  await page.waitForTimeout(350);
  assert.equal(await overlay.locator(".phase-panel").getAttribute("data-phase"), "ideas");
  assert.equal(await overlay.locator(".mode").textContent(), "LIVE ROUNDS");
  await page.screenshot({ path: "test-results/overlay-reverted.png" });
  // A late/reconnecting OBS source receives the complete current state.
  await overlay.goto("http://127.0.0.1:3000/overlay"); await overlay.waitForSelector(".connection.connected");
  await overlay.waitForSelector('.version[data-kind="revert"]'); assert.equal(await overlay.locator(".version").count(), 2);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ composite: "1920x1080", transparent, centerCovered: layout.centerCovered, ideas: 4, candidates: 3, ballots: 13, voters: 12, voteCounts: [1, 9, 2], winner: "Comet04", stubShips: 1, stubReverts: 1, retainedVersion: 1, citizens: end.citizenCount, summons: end.summonCount, measuredFps, avgFps: end.avgFps, consoleErrors: errors.length, screenshots: "test-results/overlay-{ideas,voting,building,shipped,reverted}.png" }, null, 2));
} finally { await browser.close(); }

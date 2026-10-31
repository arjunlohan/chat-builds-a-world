import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// Run against pnpm dev. SwiftShader is a correctness backend, not a GPU benchmark.
const browser = await chromium.launch({
  headless: true,
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
  assert.ok(!/swiftshader|llvmpipe|software|unknown/i.test(gpu), `Physical GPU required; found ${gpu}`);
  await page.waitForTimeout(2500);
  const start = await page.evaluate(() => ({ frame: window.__worldStats.frame, time: performance.now() }));
  await page.waitForTimeout(15_000);
  const end = await page.evaluate(() => ({ ...window.__worldStats, time: performance.now() }));
  const measuredFps = (end.frame - start.frame) * 1000 / (end.time - start.time);
  await page.screenshot({ path: "test-results/world-hardware.png" });
  console.log(JSON.stringify({ gpu, resolution: "1920x1080", measuredFps, rollingAverage: end.avgFps, frame: end.frame }, null, 2));
  assert.ok(measuredFps >= 55, `Expected near-60 fps; measured ${measuredFps.toFixed(1)}`);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}

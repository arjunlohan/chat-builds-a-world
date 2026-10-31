import assert from "node:assert/strict";
import { launchWorldPage, measureFps } from "./browser.js";

// Run against pnpm dev. SwiftShader is a correctness backend, not a GPU benchmark.
const errors:string[]=[];const {browser,page,gpu}=await launchWorldPage("http://127.0.0.1:3000","debug=1",{onPage(page){page.on("pageerror",e=>errors.push(e.message));page.on("console",e=>{if(e.type()==="error")errors.push(e.text());});}});
try {
  assert.ok(!/swiftshader|llvmpipe|software|unknown/i.test(gpu), `Physical GPU required; found ${gpu}`);
  await page.waitForTimeout(2500);
  const measurement=await measureFps(page,15000),end=measurement.stats,measuredFps=measurement.fps;
  await page.screenshot({ path: "test-results/world-hardware.png" });
  console.log(JSON.stringify({ gpu, resolution: "1920x1080", measuredFps, rollingAverage: end.avgFps, frame: end.frame }, null, 2));
  assert.ok(measuredFps >= 55, `Expected near-60 fps; measured ${measuredFps.toFixed(1)}`);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}

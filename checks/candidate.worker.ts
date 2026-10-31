import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { createWorldServer } from "../server/http.js";
import { WorldPipeline } from "../server/pipeline.js";
import { Versions } from "../server/versions/index.js";
const input = JSON.parse(await readFile(process.argv[2]!, "utf8")) as { modules: { id: string; file: string; code: string }[]; probeId: string };
const state = await mkdtemp(join(tmpdir(), "world-candidate-")), pipeline = new WorldPipeline();
const versions = new Versions(state, version => pipeline.publish({ type: "version", version }));
const modules = await Promise.all(input.modules.map(m => versions.artifact(m.id, m.file, m.code)));
await versions.activate({ version: 1, tag: "candidate", commit: "candidate", title: "Candidate", requester: "check", modules }, false);
for (let i = 0; i < 300; i++) pipeline.roster.accept({ id: `check-${i}`, userId: `check-${i}`, displayName: `Neighbor${i}`, color: "#79D7CF", text: "hello", timestamp: Date.now() }, Date.now());
const app = await createWorldServer(pipeline, undefined, undefined, versions);
await new Promise<void>(resolve => app.server.listen(0, "127.0.0.1", resolve));
const port = (app.server.address() as { port: number }).port;
const browserServer = await chromium.launchServer({ timeout: 5000, headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
console.log(JSON.stringify({ browserPid: browserServer.process().pid }));
const browser = await chromium.connect(browserServer.wsEndpoint());
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }); const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("console", e => { if (e.type() === "error") errors.push(e.text()); });
  await page.goto(`http://127.0.0.1:${port}/world?check=1&overlay=1&probe=${encodeURIComponent(input.probeId)}`);
  await page.waitForFunction(() => window.__worldStats?.moduleCount > 0 || window.__worldStats?.moduleError, undefined, { timeout: 6500 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => { window.__worldStats.maxFrameGap = 0; });
  const start = await page.evaluate(() => ({ frame: window.__worldStats.frame, now: performance.now() }));
  let maxGap = 0, last = start.now; const hashes = new Set<number>(); let maxPixels = 0;
  const sampleStart = performance.now();
  for (let sample = 0; sample < 15; sample++) {
    await page.waitForTimeout(Math.max(0, sampleStart + (sample + 1) * 1000 - performance.now()));
    const value = await page.evaluate(() => new Promise<{ frame: number; now: number; error: string; hash: number; lit: number; pixels: number; avg: number; renderer: string }>(resolve => requestAnimationFrame(() => {
      const stats = window.__worldStats, gl = document.querySelector("canvas")!.getContext("webgl2")!;
      const info = gl.getExtension("WEBGL_debug_renderer_info"), width=gl.drawingBufferWidth, height=gl.drawingBufferHeight, pixels = new Uint8Array(width * height * 4); let hash = 2166136261, lit = 0;
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      for (let y = 2; y < height; y += 5) for (let x = 2; x < width; x += 5) { const i = (y * width + x) * 4; if (pixels[i]! + pixels[i+1]! + pixels[i+2]! > 24) lit++; for (let k = 0; k < 4; k++) hash = Math.imul(hash ^ pixels[i+k]!, 16777619); }
      resolve({ frame: stats.frame, now: performance.now(), error: stats.moduleError, hash, lit, pixels: stats.modulePixels, avg: stats.avgFps, renderer: info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "" });
    })));
    if (!/swiftshader/i.test(value.renderer)) throw new Error("Candidate did not use SwiftShader.");
    if (errors.length || value.error) throw new Error(value.error || "Candidate console error.");
    if (!value.lit) throw new Error("Black canvas.");
    maxPixels = Math.max(maxPixels, value.pixels); hashes.add(value.hash);
    if (sample > 1 && !maxPixels) throw new Error("Candidate draws nothing visible.");
    maxGap = Math.max(maxGap, value.now - last); last = value.now;
  }
  const end = await page.evaluate(() => ({ ...window.__worldStats, now: performance.now() }));
  const fps = (end.frame - start.frame) * 1000 / (end.now - start.now);
  if (fps < 40 || end.avgFps < 40) throw new Error(`Candidate FPS below 40 (${fps.toFixed(1)}, avg ${end.avgFps.toFixed(1)}, cpu ${end.updateMs.toFixed(1)}, render ${end.renderMs.toFixed(1)}, cache ${end.cacheRenders}, tris ${end.triangles}).`);
  if (hashes.size < 2) throw new Error("Frozen canvas pixels.");
  if (end.frame <= start.frame || maxGap > 2000 || end.maxFrameGap > 1000) throw new Error("Frozen canvas/frame gap.");
  console.log(JSON.stringify({ ok: true, fps, avgFps: end.avgFps, samples: 15, modulePixels: maxPixels, citizens: end.citizenCount, hashes: hashes.size }));
} catch (error) { console.log(JSON.stringify({ ok: false, reason: error instanceof Error ? error.message.slice(0, 180) : "Candidate check failed." })); process.exitCode = 1; }
finally { await browser.close(); await browserServer.close(); app.closeStreams(); versions.close(); await new Promise<void>(resolve => app.server.close(() => resolve())); await rm(state, { recursive: true, force: true }); }

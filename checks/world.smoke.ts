import { expect, test } from "@playwright/test";

// Software rendering verifies correctness, not the performance of a physical GPU.
test.use({
  viewport: { width: 1920, height: 1080 },
  launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
});

test("full-HD garden renders, animates, and hides diagnostics by default", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("http://127.0.0.1:3000/world");
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "The Lantern Garden" })).toBeVisible();
  await expect(page.locator("#fps")).toBeHidden();
  await expect(page.locator("canvas")).toHaveAttribute("width", "1920");
  await expect(page.locator("canvas")).toHaveAttribute("height", "1080");
  const start = await page.evaluate(() => window.__worldStats.frame);
  await page.waitForTimeout(5000);
  const stats = await page.evaluate(() => window.__worldStats);
  expect(stats.frame).toBeGreaterThan(start + 5);
  expect(stats.fps).toBeGreaterThan(0);
  expect(stats.avgFps).toBeGreaterThan(0);
  const pixel = await page.evaluate(() => new Promise<number[]>(resolve => requestAnimationFrame(() => {
    const gl = document.querySelector("canvas")!.getContext("webgl2")!;
    const color = new Uint8Array(4);
    gl.readPixels(960, 540, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, color);
    resolve([...color]);
  })));
  expect(pixel.slice(0, 3).reduce((a, b) => a + b, 0)).toBeGreaterThan(30);
  await page.screenshot({ path: "test-results/world-day.png" });
  console.log("SwiftShader garden stats:", JSON.stringify(stats));
  expect(errors).toEqual([]);
});

test("night sky renders and debug FPS is opt-in", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("http://127.0.0.1:3000/world?debug=1&time=night");
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  await expect(page.locator("#fps")).toBeVisible();
  await expect(page.locator("#fps")).toContainText("FPS");
  await expect(page.locator("#time-of-day")).toHaveText("AFTER THE STARS");
  await page.screenshot({ path: "test-results/world-night.png" });
  expect(errors).toEqual([]);
});

import { expect, test } from "@playwright/test";

/** Phase 1 smoke only. TODO: 15-second module test, FPS and nonblack/freeze checks. */
test.use({
  viewport: { width: 1920, height: 1080 },
  launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
});
test("offline world placeholder renders with Three.js", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("http://127.0.0.1:3000/world");
  await expect(page.getByRole("heading", { name: "A world waiting for chat." })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Three.js ready · offline scaffold");
  await expect(page.locator("canvas")).toBeVisible();
  expect(errors).toEqual([]);
});

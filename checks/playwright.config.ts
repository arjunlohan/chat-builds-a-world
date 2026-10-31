import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".", testMatch: "world.smoke.ts", timeout: 30_000,
  use: { browserName: "chromium", headless: true },
  webServer: { command: "pnpm dev", url: "http://127.0.0.1:3000/world", reuseExistingServer: true },
});

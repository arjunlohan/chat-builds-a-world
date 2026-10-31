import { buildClient } from "../server/assets.js";

if (process.argv[1]?.endsWith("checks/build.ts")) {
  await buildClient();
  console.log("Browser bundles compile successfully (no files written).");
}

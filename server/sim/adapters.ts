/** Offline adapters are chosen at server construction, never by viewer/authority fields. */
import { fileURLToPath } from "node:url";
import { fixtureReview } from "../guard/index.js";
import { runCodex, runnerPrompt, type BuilderOptions } from "../runner/codex.js";
import { fixtureProvider } from "../summon/provider.js";
export function simulationAdapters() {
  let kind = "orchard";
  return {
    setOutcome(outcome: string) { kind = outcome === "fail" ? "throws" : outcome === "timeout" ? "timeout" : "orchard"; },
    reviewer: (idea: string) => fixtureReview(idea),
    summonProvider: fixtureProvider,
    builder: async (options: BuilderOptions) => runCodex({ ...options, prompt: (options.prompt??await runnerPrompt(options.root, options.decision)) + `\nSIMULATION_FIXTURE_KIND: ${kind}`, bin: fileURLToPath(new URL("../../checks/fixtures/fake-builder.cjs", import.meta.url)),
      env: { ...options.env, AWS_BEARER_TOKEN_BEDROCK: "offline-fixture-not-a-key" } }),
  };
}

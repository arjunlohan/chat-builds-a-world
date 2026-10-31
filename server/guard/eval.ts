import { config as loadEnv } from "dotenv";
import { IdeaGuard } from "./index.js";
import ideas from "./ideas.json" with { type: "json" };
loadEnv({ quiet: true });
if (!process.env.AWS_BEARER_TOKEN_BEDROCK?.trim()) {
  console.error("Guard eval needs AWS_BEARER_TOKEN_BEDROCK. No Codex process or provider request was started.");
  process.exitCode = 1;
} else {
  const guard = new IdeaGuard(); let matches = 0, falseAccepts = 0, errors = 0;
  for (const idea of ideas) {
    const result = await guard.review(idea.idea);
    const ok = result.reviewed === true && result.verdict === idea.expected;
    if (!result.reviewed) errors++; if (ok) matches++;
    if (result.verdict === "accept" && idea.expected === "reject") falseAccepts++;
    console.log(`${idea.id.padEnd(13)} ${result.verdict.padEnd(6)} expected=${idea.expected.padEnd(6)} latency=${result.latencyMs}ms ${!result.reviewed ? "ERROR" : ok ? "PASS" : "FAIL"} · ${result.reason}`);
  }
  console.log(`Real Codex + Bedrock: ${matches}/${ideas.length} expected verdicts; ${falseAccepts} unsafe acceptances; ${errors} infrastructure/validation errors. Each review has a 45s hard timeout.`);
  if (matches !== ideas.length) process.exitCode = 1;
}

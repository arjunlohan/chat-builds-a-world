import { pending } from "../contracts.js";

/** TODO: read-only codex exec, low effort, schema output; untrusted chat data. */
export async function reviewIdea(_idea: string): Promise<{ approved: boolean; reason: string }> {
  return pending("Idea guard");
}

import { pending, type ChatEvent } from "../contracts.js";

/** TODO: moderation/rate limits -> Bedrock Responses -> validation -> broadcast. */
export async function summon(_event: ChatEvent): Promise<void> {
  pending("Summon lane");
}

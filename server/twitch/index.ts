import { pending, type ChatEvent, type RaidEvent } from "../contracts.js";

/** TODO: EventSub WS, token refresh, reconnect/dedup, AutoMod and mod commands. */
export function connectTwitch(_handlers: {
  onChat(event: ChatEvent): void;
  onRaid(event: RaidEvent): void;
}): () => void {
  return pending("Twitch EventSub");
}

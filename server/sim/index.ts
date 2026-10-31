import type { ChatEvent, RaidEvent } from "../contracts.js";

/** Deterministic, offline fixtures; no connection or state writes in Phase 1. */
const chat: ChatEvent = {
  id: "sim-chat-1", userId: "sim-viewer", displayName: "DemoViewer",
  color: "#79d7cf", text: "!jump", timestamp: 0,
};
const raid: RaidEvent = {
  id: "sim-raid-1", broadcasterId: "sim-channel",
  broadcasterName: "DemoRaid", viewerCount: 25,
};
console.log(JSON.stringify({ type: "chat", event: chat }));
console.log(JSON.stringify({ type: "raid", event: raid }));
console.log("Phase 1: fixtures only; transport and citizen behavior are pending.");

import type { ChatEvent, RaidEvent } from "../contracts.js";

export const SIM_CROWD = 80;
const colors = ["#E9A18E", "#79D7CF", "#9FB3E7", "#E5C775", "#CFA3DA", "#9DCA83", "#D88FAD", "#83BDE0"];
const names = ["Moss", "Pebble", "Clover", "Comet", "Juniper", "Wisp", "Fern", "Puddle", "Willow", "Saffron"];
const lines = ["Hello, little world!", "Found my quiet corner", "That waterfall is lovely", "Lantern garden crew", "Let's explore together", "A good day to be a tiny creature", "More moss, please", "I live here now"];
export const simChatter = (i: number) => ({ userId: `sim-viewer-${i}`, displayName: `${names[i % names.length]}${String(i + 1).padStart(2, "0")}`, color: colors[i % colors.length]! });
export interface SimStep { kind: "chat" | "raid"; event: ChatEvent | RaidEvent; delay: number }
export function crowdScenario(runId: string): SimStep[] {
  const result: SimStep[] = [];
  const chat = (i: number, text: string, suffix: string): ChatEvent => ({
    id: `sim-${runId}-${suffix}-${i}`, userId: `sim-viewer-${i}`, displayName: `${names[i % names.length]}${String(i + 1).padStart(2, "0")}`,
    color: colors[i % colors.length]!, text, timestamp: 0,
  });
  for (let i = 0; i < SIM_CROWD; i++) result.push({ kind: "chat", event: chat(i, lines[i % lines.length]!, "hello"), delay: 35 });
  for (let i = 0; i < SIM_CROWD; i++) {
    const command = i % 4 === 0 ? "!jump" : i % 4 === 1 ? "!dance" : i % 4 === 2 ? `!follow ${names[(i - 1) % names.length]}${String(i).padStart(2, "0")}` : "!home";
    result.push({ kind: "chat", event: chat(i, command, "command"), delay: 25 });
  }
  result.push({ kind: "raid", event: { id: `sim-${runId}-raid`, broadcasterId: "sim-visiting-channel", broadcasterName: "TheCloudGarden", viewerCount: 24 }, delay: 200 });
  return result;
}

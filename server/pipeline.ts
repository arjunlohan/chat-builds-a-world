import type { WorldVersion } from "./versions/index.js";
import type { ChatEvent, RaidEvent, WorldEvent, LaneEvent } from "./contracts.js";
import type { SummonService } from "./summon/index.js";
import type { Rounds } from "./rounds/index.js";
import { CitizenRoster } from "./citizens/index.js";

const id = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(v);
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && [...v].length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
export function parseChat(value: unknown): ChatEvent {
  const v = value as Partial<ChatEvent> | null;
  if (!v || !id(v.id) || !id(v.userId) || !text(v.displayName, 64) || !text(v.text, 500) ||
    typeof v.color !== "string" || (v.color !== "" && !/^#[\da-f]{6}$/i.test(v.color))) throw new Error("Invalid chat event");
  // Arrival time is server-owned; old or future client timestamps cannot bypass expiry.
  return { id: v.id, userId: v.userId, displayName: v.displayName, color: v.color, text: v.text, timestamp: Date.now() };
}
export function parseRaid(value: unknown): RaidEvent {
  const v = value as Partial<RaidEvent> | null;
  if (!v || !id(v.id) || !id(v.broadcasterId) || !text(v.broadcasterName, 64) ||
    !Number.isInteger(v.viewerCount) || v.viewerCount! < 1 || v.viewerCount! > 1_000_000) throw new Error("Invalid raid event");
  return { id: v.id, broadcasterId: v.broadcasterId, broadcasterName: v.broadcasterName, viewerCount: v.viewerCount! };
}

/** Both adapters call these methods; neither has its own spawn/command path. */
export class WorldPipeline {
  readonly roster = new CitizenRoster();
  private readonly seen = new Map<string, number>();
  private readonly cooldowns = new Map<string, number>();
  private readonly listeners = new Set<(event: WorldEvent) => void>();
  private summonLane: SummonService | undefined;
  private version: WorldVersion | null = null;
  private rounds: Rounds | undefined;
  attachRounds(rounds: Rounds) { this.rounds = rounds; }
  attachSummon(lane: SummonService) { this.summonLane = lane; }
  publish(event: LaneEvent) {
    if (event.type === "version") this.version = event.version;
    this.emit({ ...event, revision: ++this.revision, now: this.now() });
    if (event.type === "summon") this.rounds?.toast("summon", event.summon.spec.name, `Summoned by ${event.summon.requester}`);
    if (event.type === "summon-remove") this.rounds?.toast("notice", "Summon cleared", "Summon removed.");
  }
  private revision = 0;
  private paused = false;
  private raids = 0;
  private window = -1;
  private messages = 0;
  constructor(private readonly now = () => Date.now(), private readonly blocklist = ["doxxing", "kill yourself"]) {}
  subscribe(listener: (event: WorldEvent) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private emit(event: WorldEvent) {
    for (const listener of this.listeners) { try { listener(event); } catch { this.listeners.delete(listener); } }
  }
  snapshot(): Extract<WorldEvent, { type: "snapshot" }> {
    return { type: "snapshot", revision: this.revision, now: this.now(), citizens: this.roster.list(), paused: this.paused, raids: this.raids, summons: this.summonLane?.active() ?? [], rounds: this.rounds?.snapshot() ?? null, version: this.version };
  }
  private duplicate(key: string, now: number) {
    if (this.seen.has(key)) return true;
    this.seen.set(key, now);
    while (this.seen.size > 10_000) this.seen.delete(this.seen.keys().next().value!);
    return false;
  }
  chat(input: unknown, authority: { moderator: boolean; fixture?: boolean; source?: "sim" | "twitch" } = { moderator: false }): { accepted: boolean; reason?: string; count?: number } {
    const event = parseChat(input), now = this.now();
    if (this.duplicate(`chat:${event.id}`, now)) return { accepted: false, reason: "duplicate" };
    const mod = /^!(pause|skip|clear)$/i.exec(event.text.trim());
    if (mod) {
      if (!authority.moderator) return { accepted: false, reason: "moderator-only" };
      const action = mod[1]!.toLowerCase() as "pause" | "skip" | "clear";
      if (action === "pause") { this.paused = !this.paused; this.rounds?.setPaused(this.paused); }
      if (action === "skip") this.rounds?.skip();
      if (action === "clear") void this.summonLane?.clearLatest();
      this.emit({ type: "control", revision: ++this.revision, now, action, paused: this.paused });
      return { accepted: true, count: this.roster.size };
    }
    if (this.paused) return { accepted: false, reason: "paused" };
    if (this.blocklist.some(term => event.text.toLocaleLowerCase().includes(term))) {
      if (/^!summon\b/i.test(event.text) && this.summonLane) { void this.summonLane.submit(event, authority); return { accepted: true, count: this.roster.size }; }
      return { accepted: false, reason: "blocked" };
    }
    const second = Math.floor(now / 1000);
    if (this.window !== second) { this.window = second; this.messages = 0; }
    if (now - (this.cooldowns.get(event.userId) ?? -Infinity) < 250 || this.messages >= 200) return { accepted: false, reason: "rate-limited" };
    this.messages++; this.cooldowns.set(event.userId, now);
    const roundCommand = /^!(idea|vote|rollback)(?:\s|$)/i.test(event.text.trim());
    const roundResult = roundCommand ? this.rounds?.command(event) : undefined;
    if (roundResult && !roundResult.accepted) return roundResult;
    const result = this.roster.accept({ ...event, timestamp: now }, now);
    if (!result) return roundResult ?? { accepted: false, reason: "capacity" };
    this.emit({ type: "chat", revision: ++this.revision, now, chat: { ...event, timestamp: now }, ...result });
    if (result.spawned && [1, 10, 25, 50, 80, 100, 150, 200, 250, 300].includes(this.roster.size))
      this.rounds?.toast("citizens", `${this.roster.size} citizens`, `Welcome, ${event.displayName}.`);
    if (/^!summon(?:\s|$)/i.test(event.text.trim())) void this.summonLane?.submit({ ...event, timestamp: now }, authority);
    return { accepted: true, count: this.roster.size };
  }
  raid(input: unknown) {
    const raid = parseRaid(input), now = this.now();
    if (this.duplicate(`raid:${raid.id}`, now)) return { accepted: false, reason: "duplicate" };
    this.raids++;
    this.emit({ type: "raid", revision: ++this.revision, now, raid });
    return { accepted: true, count: this.roster.size };
  }
  prune() {
    const now = this.now();
    const ids = this.roster.prune(now);
    if (ids.length) this.emit({ type: "remove", revision: ++this.revision, now, ids });
    for (const [id, timestamp] of this.cooldowns) if (now - timestamp > 60_000) this.cooldowns.delete(id);
    for (const [id, timestamp] of this.seen) if (now - timestamp > 30 * 60_000) this.seen.delete(id);
  }
}

import {builtinCommand,BUILTIN_COMMANDS} from "./commands.js";
import type {Reactions,ReactionCheckpoint} from "./reactions/index.js";
import { inParade } from "../world/shared/limits.js";
import { contentPolicy, DEFAULT_BLOCKLIST } from "./content-policy.js";
import type { WorldVersion } from "./versions/index.js";
import type { ChatEvent, RaidEvent, WorldEvent, LaneEvent } from "./contracts.js";
import type { SummonService } from "./summon/index.js";
import type { Rounds } from "./rounds/index.js";
import { CitizenRoster } from "./citizens/index.js";

const DEDUP_PERSIST_MS=60_000, DEDUP_PRUNE_MS=30*60_000;
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
  private readonly replyAt = new Map<string, number>();
  private lastReply = -Infinity;
  private readonly cooldowns = new Map<string, number>();
  private readonly listeners = new Set<(event: WorldEvent, serialized: string) => void>();
  private summonLane: SummonService | undefined;
  private version: WorldVersion | null = null;
  private rounds: Rounds | undefined;
  private reactions: Reactions | undefined;
  attachReactions(reactions:Reactions){this.reactions=reactions;}
  openReactionVote(){return this.reactions?.openVote()??false;}
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
  private arrival: {raid:RaidEvent;admitted:number;at:number}|null=null;
  private window = -1;
  private messages = 0;
  constructor(private readonly now = () => Date.now(), private readonly blocklist = DEFAULT_BLOCKLIST, private readonly sendRejection?: (message: string, source: "sim" | "twitch") => Promise<void>) {}
  subscribe(listener: (event: WorldEvent, serialized: string) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  reply(chat: ChatEvent, message: string, send?: () => Promise<void> | void) {
    const now = this.now();
    if (now - (this.replyAt.get(chat.userId) ?? -Infinity) < 10_000 || now - this.lastReply < 2500) return;
    this.replyAt.set(chat.userId, now); this.lastReply = now; this.publish({ type: "reply", message });
    try { void Promise.resolve(send?.()).catch(() => {}); } catch {}
  }
  private emit(event: WorldEvent) {
    const serialized = JSON.stringify(event);
    for (const listener of this.listeners) { try { listener(event, serialized); } catch { this.listeners.delete(listener); } }
  }
  checkpoint(){return {citizens:this.roster.list(),revision:this.revision,paused:this.paused,raids:this.raids,arrival:this.arrival,seen:[...this.seen].filter(([,at])=>this.now()-at<DEDUP_PERSIST_MS),replies:[...this.replyAt],lastReply:Number.isFinite(this.lastReply)?this.lastReply:null,...(this.reactions?{reactions:this.reactions.checkpoint() as ReactionCheckpoint}:{})};}
  restore(saved: ReturnType<WorldPipeline["checkpoint"]>,savedAt=this.now()){
    this.roster.restore(saved.citizens);this.revision=saved.revision;this.paused=saved.paused;this.raids=saved.raids;this.arrival=saved.arrival;
    this.seen.clear();for(const [id,at] of saved.seen)if(this.now()-at<DEDUP_PERSIST_MS)this.seen.set(id,at);
    this.cooldowns.clear();this.replyAt.clear();for(const [id,at] of saved.replies)this.replyAt.set(id,at);
    this.lastReply=saved.lastReply??-Infinity;
    if(saved.reactions)this.reactions?.restore(saved.reactions,savedAt);else this.reactions?.setPaused(this.paused);
  }
  snapshot(): Extract<WorldEvent, { type: "snapshot" }> {
    return { type: "snapshot", revision: this.revision, now: this.now(), citizens: this.roster.list(), paused: this.paused, raids: this.raids, arrival:this.arrival&&inParade(this.arrival.at,this.now())?this.arrival:null, summons: this.summonLane?.active() ?? [], rounds: this.rounds?.snapshot() ?? null, version: this.version, reactions:this.reactions?.snapshot()??null };
  }
  private duplicate(key: string, now: number) {
    if (this.seen.has(key)) return true;
    this.seen.set(key, now);
    while (this.seen.size > 10_000) this.seen.delete(this.seen.keys().next().value!);
    return false;
  }
  chat(input: unknown, authority: { moderator: boolean; source?: "sim" | "twitch" } = { moderator: false }): { accepted: boolean; reason?: string; count?: number } {
    const event = parseChat(input), now = this.now();
    if (this.duplicate(`chat:${event.id}`, now)) return { accepted: false, reason: "duplicate" };
    const second = Math.floor(now / 1000);
    if (this.window !== second) { this.window = second; this.messages = 0; }
    if (now - (this.cooldowns.get(event.userId) ?? -Infinity) < 250 || this.messages >= 200) return { accepted: false, reason: "rate-limited" };
    this.messages++; this.cooldowns.set(event.userId, now);
    const builtin=builtinCommand(event.text);
    const mod = builtin&&BUILTIN_COMMANDS[builtin]==="moderation"&&event.text.trim().toLowerCase()===`!${builtin}` ? builtin : undefined;
    if (mod) {
      if (!authority.moderator) return { accepted: false, reason: "moderator-only" };
      const action = (mod==="veto"?"skip":mod) as "pause" | "skip" | "clear";
      if (action === "pause") { this.paused = !this.paused; this.reactions?.setPaused(this.paused); this.rounds?.setPaused(this.paused); }
      if (action === "skip") this.rounds?.skip();
      if (action === "clear") void this.summonLane?.clearLatest();
      this.emit({ type: "control", revision: ++this.revision, now, action, paused: this.paused });
      return { accepted: true, count: this.roster.size };
    }
    if (this.paused) return { accepted: false, reason: "paused" };
    if (!contentPolicy(event.text, (builtin==="summon"||builtin==="idea"), this.blocklist)) {
      const message=`@${event.displayName} Please use a safe, original visual idea.`;
      this.reply(event,message,()=>this.sendRejection?.(message,authority.source??"sim"));
      return { accepted: false, reason: "blocked" };
    }
    const roundCommand = !!builtin&&BUILTIN_COMMANDS[builtin]==="round";
    const roundResult = roundCommand ? this.rounds?.command(event) : undefined;
    if (roundResult && !roundResult.accepted) return roundResult;
    const reactionResult=this.reactions?.chat(event.userId,event.text);
    if(reactionResult&&!reactionResult.accepted)return reactionResult;
    const summonCommand = builtin==="summon";
    if (summonCommand) void this.summonLane?.submit({ ...event, timestamp: now }, { source: authority.source ?? "sim" });
    const result = this.roster.accept({ ...event, timestamp: now }, now);
    if (!result) return roundResult ?? (reactionResult?.accepted ? {accepted:true,count:this.roster.size}:undefined) ?? (summonCommand ? { accepted: true, count: this.roster.size } : { accepted: false, reason: "capacity" });
    if(result.removed.length)this.emit({type:"remove",revision:++this.revision,now,ids:result.removed});
    this.emit({ type: "chat", revision: ++this.revision, now, chat: { ...event, timestamp: now }, citizen:result.citizen,spawned:result.spawned });
    if (result.spawned && [1, 10, 25, 50, 80, 100, 150, 200, 250, 300].includes(this.roster.size))
      this.rounds?.toast("citizens", `${this.roster.size} citizens`, `Welcome, ${event.displayName}.`);
    return { accepted: true, count: this.roster.size };
  }
  raid(input: unknown) {
    const raid = parseRaid(input), now = this.now();
    if (this.duplicate(`raid:${raid.id}`, now)) return { accepted: false, reason: "duplicate" };
    const {citizens,removed}=this.roster.arrive(raid,now);
    if(removed.length)this.emit({type:"remove",revision:++this.revision,now,ids:removed});
    this.raids++;this.arrival={raid,admitted:citizens.length,at:now};
    this.emit({ type: "raid", revision: ++this.revision, now, raid, citizens });
    this.rounds?.toast("notice",`Raid from ${raid.broadcasterName}`,`${raid.viewerCount} viewers · ${citizens.length} arriving`);
    return { accepted: true, count: this.roster.size, admitted:citizens.length, replaced:removed.length };
  }
  prune() {
    const now = this.now();
    const ids = this.roster.prune(now);
    if (ids.length) this.emit({ type: "remove", revision: ++this.revision, now, ids });
    for (const [id, timestamp] of this.replyAt) if (now - timestamp > 60_000) this.replyAt.delete(id);
    for (const [id, timestamp] of this.cooldowns) if (now - timestamp > 60_000) this.cooldowns.delete(id);
    for (const [id, timestamp] of this.seen) if (now - timestamp > DEDUP_PRUNE_MS) this.seen.delete(id);
  }
}

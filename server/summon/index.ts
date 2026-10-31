import { SummonReservations } from "../../world/shared/limits.js";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import type { ChatEvent, LaneEvent, SummonState } from "../contracts.js";
import { normalizeSceneSpec, specUsage } from "./scene-spec.js";
import { bedrockProvider, fixtureProvider, SummonError, type Provider, type SummonConfig, type TokenUsage } from "./provider.js";

export const USER_COOLDOWN = 60_000, GLOBAL_COOLDOWN = 5000;
export { allowedWish } from "../content-policy.js";
import { allowedWish } from "../content-policy.js";
export interface SummonJob {
  id: string; mode: "fixture" | "live"; model: string; effort: string; tier: string;
  status: "generating" | "awaiting-render" | "rendered" | "failed" | "cleared";
  requestedAt: number; validatedAt: number | null; providerMs: number | null; latencyMs: number | null;
  renderTimedOut?: boolean; renderError?: string; valid: boolean; clamped: boolean; usage: TokenUsage | null; reason: string | null;
}
interface InternalJob { public: SummonJob; chat: ChatEvent; source: "sim" | "twitch"; receipt: string; logged: boolean }
export function metricWriter(directory = "state", filename = "summon-metrics.jsonl") {
  let tail = Promise.resolve();
  return (job: unknown) => {
    const record = JSON.stringify(job) + "\n";
    tail = tail.then(async () => { await mkdir(directory, { recursive: true }); await appendFile(`${directory}/${filename}`, record, { mode: 0o600 }); })
      .catch(() => { console.warn("Metrics could not be saved to state/."); });
    return tail;
  };
}
interface Options {
  config: SummonConfig; publish(event: LaneEvent): void;
  reply(chat: ChatEvent, message: string, source: "sim" | "twitch"): Promise<void> | void;
  now?: () => number; provider?: Provider; mode?: "live" | "fixture"; record?: (job: SummonJob) => Promise<void> | void;
}
const failureText: Record<string, string> = {
  blocked: "Please summon an original, safe visual object. Instructions, links, private data and brands are blocked.",
  "user-cooldown": "You can summon once every 60 seconds.", "global-cooldown": "The world needs a moment. Try again in 5 seconds.",
  "missing-key": "Live Summon is not configured yet. The local simulator has explicit fixture summons.",
  capacity: "The world is full. A moderator can !clear the last summon.",
};
export class SummonService {
  private readonly jobs = new Map<string, InternalJob>();
  private readonly scenes = new Map<string, SummonState>();
  private readonly reservations = new SummonReservations(id => this.remove(id, "evicted"));
  private readonly users = new Map<string, number>();
  private readonly replyTimes = new Map<string, number>();
  private lastGlobal = -Infinity;
  private readonly now: () => number;
  private readonly record: NonNullable<Options["record"]>;
  constructor(private readonly options: Options) { this.now = options.now ?? Date.now; this.record = options.record ?? metricWriter(); }
  active() { return [...this.scenes.values()]; }
  status(id: string) { const job = this.jobs.get(id)?.public; return job ? structuredClone(job) : undefined; }
  private async log(job: InternalJob) {
    if (job.logged) return;
    job.logged = true;
    try { await this.record(structuredClone(job.public)); } catch { /* Logging must not break the live world. */ }
  }
  private async reply(job: InternalJob, message: string) {
    try { await this.options.reply(job.chat, `@${job.chat.displayName} ${message}`.slice(0, 500), job.source); }
    catch { console.warn("Summon chat reply could not be delivered."); }
  }
  private async fail(job: InternalJob, reason: string) {
    job.public.status = "failed"; job.public.reason = reason;
    if (this.now() - (this.replyTimes.get(job.chat.userId) ?? -Infinity) >= 10_000) {
      this.replyTimes.set(job.chat.userId, this.now());
      await this.reply(job, failureText[reason] ?? "That summon could not safely appear. Please try a simpler visual wish later.");
    }
    await this.log(job);
  }
  async submit(chat: ChatEvent, context: { source?: "sim" | "twitch" } = {}) {
    if (this.jobs.has(chat.id)) return this.status(chat.id)!;
    const now = this.now(), mode = this.options.mode ?? "live";
    const job: InternalJob = { chat, source: context.source ?? "sim", receipt: randomUUID(), logged: false, public: {
      id: chat.id, mode, model: mode === "fixture" ? "hand-written-fixture-v1" : this.options.config.model,
      effort: this.options.config.effort, tier: this.options.config.tier, status: "generating", requestedAt: now,
      validatedAt: null, providerMs: null, latencyMs: null, valid: false, clamped: false, usage: null, reason: null,
    } };
    this.jobs.set(chat.id, job);
    const wish = chat.text.replace(/^!summon\b/i, "").trim();
    if (now - (this.users.get(chat.userId) ?? -Infinity) < USER_COOLDOWN) { await this.fail(job, "user-cooldown"); return this.status(chat.id)!; }
    if (now - this.lastGlobal < GLOBAL_COOLDOWN) { await this.fail(job, "global-cooldown"); return this.status(chat.id)!; }
    if (!this.reservations.reserve(chat.id)) { await this.fail(job, "capacity-busy"); return this.status(chat.id)!; }
    this.users.set(chat.userId, now); this.lastGlobal = now;
    try {
      const provider = this.options.provider ?? bedrockProvider(this.options.config);
      const generated = await provider.generate(wish);
      job.public.providerMs = this.now() - now; job.public.usage = generated.usage;
      const { spec, clamped } = normalizeSceneSpec(generated.json);
      if (!allowedWish(spec.name)) throw new SummonError("blocked-output");
      job.public.valid = true; job.public.clamped = clamped;
      const used = specUsage(spec);
      this.reservations.commit(chat.id, used);
      const state: SummonState = { id: chat.id, spec, requester: chat.displayName, requestedAt: now, receipt: job.receipt, mode };
      job.public.valid = true; job.public.clamped = clamped; job.public.status = "awaiting-render"; job.public.validatedAt = this.now();
      this.scenes.set(state.id, state); this.options.publish({ type: "summon", summon: state });
    } catch (error) {
      this.reservations.release(chat.id);
      if (error instanceof SummonError && error.usage) job.public.usage = error.usage;
      job.public.providerMs ??= this.now() - now;
      await this.fail(job, error instanceof SummonError ? error.code : "invalid-spec");
    }
    return this.status(chat.id)!;
  }
  async acknowledge(id: string, receipt: string, failure?: string, primary = true) {
    const job = this.jobs.get(id);
    if (!job || job.receipt !== receipt) return false;
    if (job.public.status === "rendered") return true;
    if (job.public.status !== "awaiting-render") return false;
    if (!primary) return false;
    if (failure) {
      if (!["capacity", "invalid-spec", "allocation", "render-error"].includes(failure)) return false;
      job.public.renderError = failure;
      this.remove(id, "primary-render-failure");
      await this.fail(job, failure);
    } else {
      job.public.status = "rendered"; job.public.reason = null; job.logged = false; job.public.latencyMs = Math.max(0, this.now() - job.public.requestedAt);
      await this.log(job);
    }
    return true;
  }
  private remove(id: string, reason: string) {
    this.reservations.release(id); this.scenes.delete(id); this.options.publish({ type: "summon-remove", ids: [id] });
    const job = this.jobs.get(id); if (job && job.public.status !== "failed") { job.public.status = "cleared"; job.public.reason = reason; void this.log(job); }
  }
  async clearLatest() {
    const scene = this.active().at(-1);
    if (!scene) return;
    this.remove(scene.id, "cleared");
    const job = this.jobs.get(scene.id)!;
    if (job.public.status === "awaiting-render") { job.public.status = "cleared"; job.public.reason = "cleared-before-render"; await this.log(job); }
  }
  prune() {
    const now = this.now();
    for (const job of this.jobs.values()) if (job.public.status === "awaiting-render" && !job.public.renderTimedOut && now - job.public.validatedAt! >= 30_000) {
      // Keep a valid scene for a later OBS connection; record that it was not observed on screen.
      job.public.renderTimedOut = true; void this.log(job);
    }
    for (const [id, at] of this.users) if (now - at >= USER_COOLDOWN) this.users.delete(id);
    for (const [id, at] of this.replyTimes) if (now - at >= 60_000) this.replyTimes.delete(id);
    for (const [id, job] of this.jobs) if (this.jobs.size > 100 && job.public.status !== "generating" && job.public.status !== "awaiting-render" && !this.scenes.has(id)) this.jobs.delete(id);
  }
}

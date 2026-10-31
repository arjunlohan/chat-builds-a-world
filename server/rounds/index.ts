import type { BuildRequest, RunResult } from "../runner/index.js";
import type { GuardResult } from "../guard/index.js";
import type { ChatEvent } from "../contracts.js";
import { allowedWish } from "../summon/index.js";
import type { BuildView, IdeaView, RoundState, StubOutcome, ToastView, VersionView } from "./types.js";
export type { RoundState, StubOutcome } from "./types.js";

export const ROUND_MS = Object.freeze({ ideas: 120_000, voting: 45_000, guarding: 45_000, building: 180_000, rollback: 30_000 });
interface Idea { id: string; text: string; requester: string; order: number; normalized: string; supporters: Set<string> }
interface Options { now?: () => number; publish(state: RoundState): void; simulationAllowed?: boolean; build?: (request: BuildRequest) => Promise<RunResult>; rollback?: (requester: string) => Promise<RunResult>; canRollback?: () => boolean; review?: (idea: string, context: { fixture: boolean; signal: AbortSignal }) => GuardResult | Promise<GuardResult> }
const stop = new Set("a an the and or to of for please add build make give put some with on in it island".split(" "));
export function normalizeIdea(text: string) {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(w => w && !stop.has(w)).join(" ");
}
export function similarIdeas(a: string, b: string) {
  if (a === b) return true;
  const numbers = (s: string) => s.match(/\d+/g)?.join(",") ?? "";
  if (numbers(a) !== numbers(b)) return false;
  const x = new Set(a.split(" ")), y = new Set(b.split(" "));
  const common = [...x].filter(w => y.has(w)).length;
  if (common >= 3 && common / new Set([...x, ...y]).size >= 0.72) return true;
  if (Math.abs(a.length - b.length) > Math.max(a.length, b.length) * 0.12) return false;
  // Bounded edit distance also catches small typos and spacing differences.
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1]! + 1, row[j]! + 1, row[j - 1]! + Number(a[i - 1] !== b[j - 1]));
    row = next;
  }
  return row[b.length]! / Math.max(a.length, b.length) <= 0.12;
}
const ideaView = (i: Idea): IdeaView => ({ id: i.id, text: i.text, requester: i.requester, supporters: i.supporters.size, order: i.order });

/** Authoritative clock/state machine. Ships/reverts are explicitly stub results, never Git operations. */
export class Rounds {
  private readonly real: () => number;
  private anchorReal: number;
  private anchorLogical: number;
  private rate = 1;
  private simulation = false;
  private paused = false;
  private phase: RoundState["phase"] = "ideas";
  private round = 1;
  private startedAt: number;
  private endsAt: number;
  private order = 0;
  private readonly ideas = new Map<string, Idea>();
  private readonly support = new Map<string, string>();
  private readonly votes = new Map<string, string>();
  private shortlist: Idea[] = [];
  private winner: Idea | undefined;
  private approved: GuardResult | undefined;
  private guard: RoundState["guard"] = { status: "idle", mode: "live", reason: "", title: "", latencyMs: null };
  private reviewSequence = 0;
  private reviewAbort: AbortController | undefined;
  private pendingReview: GuardResult | undefined;
  private runAbort: AbortController | undefined;
  private runSequence = 0;
  private rollbackVotes = new Map<string, "yes" | "no">();
  private rollbackRequester = "";
  private fixtureOutcome: StubOutcome = "ship";
  private build: BuildView = { stub: false, status: "idle", progress: 0, idea: "", requester: "", lines: [] };
  private timeline: VersionView[] = [];
  private toasts: ToastView[] = [];
  private serial = 0;
  private version = 0;
  private lastEmit = -Infinity;
  private dirty = true;
  constructor(private readonly options: Options) {
    this.real = options.now ?? Date.now;
    this.anchorReal = this.anchorLogical = this.startedAt = this.real();
    this.endsAt = this.startedAt + ROUND_MS.ideas;
  }
  private now() { return this.anchorLogical + (this.paused ? 0 : (this.real() - this.anchorReal) * this.rate); }
  private ranked() { return [...this.ideas.values()].filter(i => i.supporters.size > 0).sort((a, b) => b.supporters.size - a.supporters.size || a.order - b.order); }
  snapshot(): RoundState {
    return structuredClone({ round: this.round, phase: this.phase, startedAt: this.startedAt, endsAt: this.endsAt,
      now: this.now(), realNow: this.real(), clockRate: this.rate, simulation: this.simulation, paused: this.paused,
      rollback: this.phase === "rollback" ? { yes: [...this.rollbackVotes.values()].filter(v => v === "yes").length, no: [...this.rollbackVotes.values()].filter(v => v === "no").length, requester: this.rollbackRequester } : null,
      guard: this.guard, totalIdeas: this.ranked().length, ideas: this.ranked().slice(0, 8).map(ideaView),
      candidates: this.shortlist.map((i, index) => ({ ...ideaView(i), slot: index + 1, votes: [...this.votes.values()].filter(id => id === i.id).length })),
      totalVotes: this.votes.size, winner: this.winner ? ideaView(this.winner) : null, build: this.build,
      timeline: this.timeline, toasts: this.toasts.filter(t => t.expiresAt > this.real()),
    });
  }
  private emit(force = false) {
    this.dirty = true;
    if (force || this.real() - this.lastEmit >= 100) {
      this.lastEmit = this.real(); this.dirty = false; this.options.publish(this.snapshot());
    }
  }
  toast(kind: ToastView["kind"], title: string, detail: string) {
    this.toasts.push({ id: ++this.serial, kind, title: title.slice(0, 80), detail: detail.slice(0, 150), expiresAt: this.real() + 8000 });
    this.toasts = this.toasts.slice(-8); this.emit();
  }
  command(chat: ChatEvent) {
    this.tick();
    if (this.paused) return { accepted: false, reason: "round-paused" };
    if (/^!rollback$/i.test(chat.text.trim())) {
      if (this.phase !== "ideas") return { accepted: false, reason: "round-busy" };
      if (!this.options.canRollback?.()) return { accepted: false, reason: "no-previous-version" };
      this.phase = "rollback"; this.startedAt = this.now(); this.endsAt = this.startedAt + ROUND_MS.rollback;
      this.rollbackVotes.clear(); this.rollbackRequester = chat.displayName; this.emit(true); return { accepted: true };
    }
    if (this.phase === "rollback") {
      const ballot = /^!vote\s+(yes|no)$/i.exec(chat.text.trim());
      if (!ballot) return { accepted: false, reason: "use-vote-yes-or-no" };
      if (!this.rollbackVotes.has(chat.userId) && this.rollbackVotes.size >= 5000) return { accepted: false, reason: "vote-capacity" };
      this.rollbackVotes.set(chat.userId, ballot[1]!.toLowerCase() as "yes" | "no"); this.emit(); return { accepted: true };
    }
    const idea = /^!idea(?:\s+(.*))?$/is.exec(chat.text.trim());
    if (idea) {
      if (this.phase !== "ideas") return { accepted: false, reason: "ideas-closed" };
      const text = idea[1]?.trim() ?? "", normalized = normalizeIdea(text);
      if (!normalized || [...text].length > 180 || !allowedWish(text)) return { accepted: false, reason: "invalid-idea" };
      const match = [...this.ideas.values()].find(i => similarIdeas(i.normalized, normalized));
      if (!match && this.ideas.size >= 100) return { accepted: false, reason: "idea-capacity" };
      if (!this.support.has(chat.userId) && this.support.size >= 5000) return { accepted: false, reason: "round-capacity" };
      const previous = this.support.get(chat.userId);
      if (previous) this.ideas.get(previous)?.supporters.delete(chat.userId);
      const proposal = match ?? { id: `r${this.round}-i${++this.order}`, text, normalized, requester: chat.displayName, order: this.order, supporters: new Set<string>() };
      proposal.supporters.add(chat.userId); this.ideas.set(proposal.id, proposal); this.support.set(chat.userId, proposal.id);
      this.emit(); return { accepted: true, ideaId: proposal.id };
    }
    const vote = /^!vote\s+([123])$/i.exec(chat.text.trim());
    if (vote) {
      if (this.phase !== "voting") return { accepted: false, reason: "voting-closed" };
      const proposal = this.shortlist[Number(vote[1]) - 1];
      if (!proposal) return { accepted: false, reason: "invalid-option" };
      if (!this.votes.has(chat.userId) && this.votes.size >= 5000) return { accepted: false, reason: "vote-capacity" };
      this.votes.set(chat.userId, proposal.id); this.emit(); return { accepted: true };
    }
    return { accepted: false, reason: "invalid-round-command" };
  }
  private collect(at: number) {
    this.round++; this.phase = "ideas"; this.startedAt = at; this.endsAt = at + ROUND_MS.ideas;
    this.ideas.clear(); this.support.clear(); this.votes.clear(); this.shortlist = []; this.winner = undefined;
    this.order = 0; this.approved = undefined;
  }
  private startVote(at: number) {
    this.shortlist = this.ranked().slice(0, 3);
    if (!this.shortlist.length) { this.collect(at); return; }
    this.phase = "voting"; this.startedAt = at; this.endsAt = at + ROUND_MS.voting;
  }
  private startReview(at: number) {
    const score = (i: Idea) => [...this.votes.values()].filter(id => id === i.id).length;
    this.winner = [...this.shortlist].sort((a, b) => score(b) - score(a) || a.order - b.order)[0];
    if (!this.winner) { this.collect(at); return; }
    this.phase = "guarding"; this.startedAt = at; this.endsAt = at + ROUND_MS.guarding;
    this.guard = { status: "reviewing", mode: this.simulation ? "fixture" : "live", reason: "", title: "", latencyMs: null };
    this.build = { stub: false, status: "reviewing", progress: 0, idea: this.winner.text, requester: this.winner.requester,
      lines: [{ id: ++this.serial, kind: "check", text: this.simulation ? "Fixture safety + scope review." : "Read-only safety + scope review." }] };
    const sequence = ++this.reviewSequence, controller = new AbortController(); this.reviewAbort = controller;
    this.emit(true);
    const reject = (): GuardResult => ({ verdict: "reject", reason: "Guard unavailable; review rejected.", title: "Idea rejected", spec: null, files: [], latencyMs: 0, mode: this.simulation ? "fixture" : "live" });
    const receive = (decision: GuardResult) => {
      if (sequence !== this.reviewSequence || this.phase !== "guarding") return;
      if (this.paused) { this.pendingReview = decision; return; }
      this.applyReview(decision);
    };
    try {
      const result = this.options.review?.(this.winner.text, { fixture: this.simulation, signal: controller.signal }) ?? reject();
      if (result instanceof Promise) void result.then(receive, () => receive(reject()));
      else receive(result);
    } catch { receive(reject()); }
  }
  private applyReview(decision: GuardResult) {
    this.reviewAbort = undefined; this.pendingReview = undefined;
    this.guard = { status: decision.verdict === "accept" ? "accepted" : "rejected", mode: decision.mode, reason: decision.reason, title: decision.title, latencyMs: decision.latencyMs };
    if (decision.verdict === "accept" && decision.spec && decision.files.length) { this.approved = structuredClone(decision); this.startBuild(this.now()); }
    else {
      this.build.status = "failed"; this.build.lines.push({ id: ++this.serial, kind: "error", text: decision.reason });
      this.collect(this.now()); this.resetSimulation();
      this.toast("notice", "Guard rejected idea", decision.reason);
    }
    this.emit(true);
  }
  private resetSimulation() {
    if (this.simulation) { const logical = this.now(); this.anchorLogical = logical; this.anchorReal = this.real(); this.rate = 1; this.simulation = false; }
  }
  private cancelReview() { this.reviewSequence++; this.reviewAbort?.abort(); this.reviewAbort = undefined; this.pendingReview = undefined; }
  feed(kind: "plan" | "edit" | "check" | "ship" | "error", text: string) {
    this.build.lines.push({ id: ++this.serial, kind, text: text.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 180) });
    this.build.lines = this.build.lines.slice(-64);
    this.build.progress = kind === "check" ? 75 : kind === "edit" ? 40 : kind === "ship" ? 95 : this.build.progress;
    this.emit();
  }
  private startBuild(at: number, rollback = false) {
    if (!rollback && (!this.approved?.spec || !this.winner)) return;
    this.phase = "building"; this.startedAt = at; this.endsAt = at + ROUND_MS.building;
    const approved = this.approved ? structuredClone(this.approved) : undefined;
    if (this.simulation && approved?.mode === "fixture" && approved.spec) approved.spec.description = this.fixtureOutcome === "fail" ? "throws" : this.fixtureOutcome === "timeout" ? "timeout" : "good";
    // Rehearsals accelerate voting, never the subprocess/check deadline.
    this.resetSimulation(); this.startedAt = this.now(); this.endsAt = this.startedAt + ROUND_MS.building;
    this.build = { stub: false, status: "running", progress: 0, idea: rollback ? "Restore previous tag" : this.winner!.text, requester: rollback ? this.rollbackRequester : this.winner!.requester, lines: [] };
    const controller = new AbortController(), sequence = ++this.runSequence; this.runAbort = controller;
    const unavailable: RunResult = { ok: false, outcome: "REVERTED", reason: "Runner is not configured.", durationMs: 0, tokens: { input: null, output: null, total: null } };
    const job = rollback ? this.options.rollback?.(this.rollbackRequester) : this.options.build?.({ decision: approved!, requester: this.winner!.requester, signal: controller.signal });
    void (job ?? Promise.resolve(unavailable)).then(result => {
      if (sequence !== this.runSequence) return;
      this.runAbort = undefined; this.finishRun(result);
    }, () => { if (sequence === this.runSequence) this.finishRun({ ...unavailable, reason: "Runner failed; candidate discarded." }); });
    this.emit(true);
  }
  private finishRun(result: RunResult) {
    const requester = this.build.requester, title = this.build.idea;
    this.build.status = result.ok ? "shipped" : "failed"; this.build.progress = result.ok ? 100 : 0; this.build.completedAt = this.real();
    this.feed(result.ok ? "ship" : "error", `${result.outcome} · ${result.reason}`);
    if (result.version) this.version = result.version;
    this.timeline.push({ id: ++this.serial, version: this.version, kind: result.ok && result.outcome === "SHIPPED" ? "ship" : "revert", title, requester, reason: result.reason, stub: false });
    this.timeline = this.timeline.slice(-12); this.collect(this.now()); this.resetSimulation();
    this.toast(result.ok && result.outcome === "SHIPPED" ? "ship" : "revert", result.ok ? result.outcome === "ROLLED BACK" ? "ROLLED BACK" : `v${this.version} SHIPPED` : "REVERTED", result.ok ? `${requester}: ${title}` : result.reason);
    this.emit(true);
  }
  private endRollback() {
    const yes = [...this.rollbackVotes.values()].filter(v => v === "yes").length;
    const no = this.rollbackVotes.size - yes;
    if (yes > no) this.startBuild(this.now(), true);
    else { this.collect(this.now()); this.toast("notice", "Rollback vote declined", `${yes} yes · ${no} no`); }
  }
  tick() {
    const now = this.now();
    if (!this.paused) for (let transitions = 0; transitions < 8; transitions++) {
      if (this.phase === "ideas" && now >= this.endsAt) this.startVote(this.endsAt);
      else if (this.phase === "voting" && now >= this.endsAt) this.startReview(this.endsAt);
      else if (this.phase === "guarding" && now >= this.endsAt) {
        this.cancelReview(); this.applyReview({ verdict: "reject", reason: "Guard timed out after 45 seconds.", title: "Review timeout", spec: null, files: [], mode: this.guard.mode, latencyMs: ROUND_MS.guarding });
      } else if (this.phase === "rollback" && now >= this.endsAt) this.endRollback();
      else if (this.phase === "building" && now >= this.endsAt) { this.runSequence++; this.runAbort?.abort(); this.finishRun({ ok: false, outcome: "REVERTED", reason: "180-second build timeout.", durationMs: ROUND_MS.building, tokens: { input: null, output: null, total: null } });
      } else break;
      this.dirty = true;
    }
    const active = this.toasts.filter(t => t.expiresAt > this.real());
    if (active.length !== this.toasts.length) { this.toasts = active; this.dirty = true; }
    if (this.dirty || this.real() - this.lastEmit >= 1000) this.emit();
  }
  setPaused(value: boolean) {
    if (value === this.paused) return;
    this.anchorLogical = this.now(); this.anchorReal = this.real(); this.paused = value;
    if (!value && this.pendingReview) this.applyReview(this.pendingReview);
    this.emit(true);
  }
  skip() {
    this.tick(); const now = this.now();
    if (this.phase === "ideas") this.startVote(now);
    else if (this.phase === "voting") this.startReview(now);
    else if (this.phase === "guarding") { this.cancelReview(); this.applyReview({ verdict: "reject", reason: "Guard review skipped by a moderator.", title: "Review skipped", spec: null, files: [], mode: this.guard.mode, latencyMs: 0 }); }
    else if (this.phase === "rollback") this.endRollback();
    else { this.runSequence++; this.runAbort?.abort(); this.finishRun({ ok: false, outcome: "REVERTED", reason: "Build skipped by a moderator.", durationMs: 0, tokens: { input: null, output: null, total: null } }); }
    this.emit(true);
  }
  cancelForRevert() { this.cancelReview(); this.runSequence++; this.runAbort?.abort(); }
  externalResult(result: RunResult) { this.build.idea = "Restore previous world"; this.build.requester = "system"; this.finishRun(result); }
  dispose() { this.cancelReview(); this.runSequence++; this.runAbort?.abort(); }
  startSimulation(outcome: StubOutcome) {
    if (!this.options.simulationAllowed) return { accepted: false, reason: "simulation-disabled" };
    if (this.phase !== "ideas" || this.ranked().length || this.paused) return { accepted: false, reason: "round-busy" };
    this.anchorLogical = this.now(); this.anchorReal = this.real(); this.rate = 15; this.simulation = true; this.fixtureOutcome = outcome;
    this.startedAt = this.now(); this.endsAt = this.startedAt + ROUND_MS.ideas; this.emit(true);
    return { accepted: true, round: this.round };
  }
}

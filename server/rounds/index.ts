import type { ChatEvent } from "../contracts.js";
import { allowedWish } from "../summon/index.js";
import type { BuildView, IdeaView, RoundState, StubOutcome, ToastView, VersionView } from "./types.js";
export type { RoundState, StubOutcome } from "./types.js";

export const ROUND_MS = Object.freeze({ ideas: 120_000, voting: 45_000, building: 180_000, stubComplete: 90_000 });
interface Idea { id: string; text: string; requester: string; order: number; normalized: string; supporters: Set<string> }
interface Options { now?: () => number; publish(state: RoundState): void; simulationAllowed?: boolean }
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
  private outcome: StubOutcome = "ship";
  private build: BuildView = { stub: true, status: "idle", progress: 0, idea: "", requester: "", lines: [] };
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
      totalIdeas: this.ranked().length, ideas: this.ranked().slice(0, 8).map(ideaView),
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
    this.order = 0;
  }
  private startVote(at: number) {
    this.shortlist = this.ranked().slice(0, 3);
    if (!this.shortlist.length) { this.collect(at); return; }
    this.phase = "voting"; this.startedAt = at; this.endsAt = at + ROUND_MS.voting;
  }
  private startBuild(at: number) {
    const score = (i: Idea) => [...this.votes.values()].filter(id => id === i.id).length;
    this.winner = [...this.shortlist].sort((a, b) => score(b) - score(a) || a.order - b.order)[0];
    if (!this.winner) { this.collect(at); return; }
    this.phase = "building"; this.startedAt = at; this.endsAt = at + ROUND_MS.building;
    this.build = { stub: true, status: "running", progress: 0, idea: this.winner.text, requester: this.winner.requester, lines: [] };
    this.progress(0);
  }
  private progress(elapsed: number) {
    const steps = [
      [0, "plan", "Viewer idea selected. Preparing a World Module API plan."],
      [15_000, "plan", "Stub plan ready. Engine files stay locked."],
      [30_000, "edit", "Simulating module edits in world/modules/."],
      [45_000, "edit", "Simulating lifecycle hooks and resource cleanup."],
      [60_000, "check", "Simulating type, frame-budget and browser checks."],
      [75_000, "check", "Stub checks complete. Preparing the result."],
    ] as const;
    for (let i = this.build.lines.length; i < steps.length; i++) {
      const step = steps[i]!; if (elapsed < step[0]) break;
      this.build.lines.push({ id: ++this.serial, kind: step[1], text: step[2] }); this.dirty = true;
    }
    this.build.progress = Math.min(94, Math.floor(elapsed / ROUND_MS.stubComplete * 94));
  }
  private finish(success: boolean, at: number, reason = "Stub check failed; previous version retained.") {
    const title = this.winner?.text ?? this.build.idea, requester = this.winner?.requester ?? this.build.requester;
    this.build.status = success ? "shipped" : "failed"; this.build.progress = success ? 100 : this.build.progress;
    this.build.lines.push({ id: ++this.serial, kind: success ? "ship" : "error", text: success ? "Stub ship complete. No code or Git tag was changed." : reason });
    if (success) this.version++;
    this.timeline.push({ id: ++this.serial, version: this.version, kind: success ? "ship" : "revert", title, requester, reason: success ? "Rehearsal ship" : reason, stub: true });
    this.timeline = this.timeline.slice(-12);
    this.collect(at);
    if (this.simulation) { const logical = this.now(); this.anchorLogical = logical; this.anchorReal = this.real(); this.rate = 1; this.simulation = false; this.outcome = "ship"; }
    this.toast(success ? "ship" : "revert", success ? `v${this.version} shipped · stub` : `Build reverted · kept v${this.version}`, `${requester}: ${title}`);
  }
  tick() {
    const now = this.now();
    if (!this.paused) for (let transitions = 0; transitions < 8; transitions++) {
      if (this.phase === "ideas" && now >= this.endsAt) this.startVote(this.endsAt);
      else if (this.phase === "voting" && now >= this.endsAt) this.startBuild(this.endsAt);
      else if (this.phase === "building") {
        this.progress(now - this.startedAt);
        if (this.outcome !== "timeout" && now >= this.startedAt + ROUND_MS.stubComplete) this.finish(this.outcome === "ship", this.startedAt + ROUND_MS.stubComplete);
        else if (now >= this.endsAt) this.finish(false, this.endsAt, "180-second build timeout; previous version retained.");
        else break;
      } else break;
      this.dirty = true;
    }
    const active = this.toasts.filter(t => t.expiresAt > this.real());
    if (active.length !== this.toasts.length) { this.toasts = active; this.dirty = true; }
    if (this.dirty || this.real() - this.lastEmit >= 1000) this.emit();
  }
  setPaused(value: boolean) {
    if (value === this.paused) return;
    this.anchorLogical = this.now(); this.anchorReal = this.real(); this.paused = value; this.emit(true);
  }
  skip() {
    this.tick(); const now = this.now();
    if (this.phase === "ideas") this.startVote(now);
    else if (this.phase === "voting") this.startBuild(now);
    else this.finish(false, now, "Build skipped by a moderator; previous version retained.");
    this.emit(true);
  }
  startSimulation(outcome: StubOutcome) {
    if (!this.options.simulationAllowed) return { accepted: false, reason: "simulation-disabled" };
    if (this.phase !== "ideas" || this.ranked().length || this.paused) return { accepted: false, reason: "round-busy" };
    this.anchorLogical = this.now(); this.anchorReal = this.real(); this.rate = 15; this.simulation = true; this.outcome = outcome;
    this.startedAt = this.now(); this.endsAt = this.startedAt + ROUND_MS.ideas; this.emit(true);
    return { accepted: true, round: this.round };
  }
}

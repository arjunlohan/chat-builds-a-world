export type RoundPhase = "ideas" | "voting" | "building";
export type StubOutcome = "ship" | "fail" | "timeout";
export interface IdeaView { id: string; text: string; requester: string; supporters: number; order: number }
export interface VoteOption extends IdeaView { slot: number; votes: number }
export interface FeedLine { id: number; text: string; kind: "plan" | "edit" | "check" | "ship" | "error" }
export interface BuildView {
  stub: true; status: "idle" | "running" | "shipped" | "failed"; progress: number;
  idea: string; requester: string; lines: FeedLine[];
}
export interface VersionView { id: number; version: number; kind: "ship" | "revert"; title: string; requester: string; reason: string; stub: true }
export interface ToastView { id: number; kind: "summon" | "citizens" | "ship" | "revert" | "notice"; title: string; detail: string; expiresAt: number }
export interface RoundState {
  round: number; phase: RoundPhase; startedAt: number; endsAt: number;
  now: number; realNow: number; clockRate: number; simulation: boolean; paused: boolean;
  totalIdeas: number; ideas: IdeaView[]; candidates: VoteOption[]; totalVotes: number;
  winner: IdeaView | null; build: BuildView; timeline: VersionView[]; toasts: ToastView[];
}

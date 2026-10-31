import type {ReactionState} from "./reactions/index.js";
import type { WorldVersion } from "./versions/index.js";
import type { RoundState } from "./rounds/types.js";
import type { SceneSpec } from "./summon/scene-spec.js";

export interface ChatEvent {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly color: string;
  readonly text: string;
  readonly timestamp: number;
}

export interface RaidEvent {
  readonly id: string;
  readonly broadcasterId: string;
  readonly broadcasterName: string;
  readonly viewerCount: number;
}

/** Explicitly unavailable until the relevant implementation phase. */
export function pending(feature: string): never {
  throw new Error(`${feature} is not implemented in Phase 1`);
}

export type CitizenCommand =
  { kind: "jump" | "dance" | "home" } | { kind: "follow"; targetId: string };
export interface CitizenState {
  readonly id: string;
  readonly displayName: string;
  readonly color: string;
  readonly home: readonly [number, number, number];
  readonly lastActive: number;
  readonly speech: string;
  readonly speechAt: number;
  readonly command: CitizenCommand | null;
  readonly commandAt: number;
  readonly entry?: {readonly from:readonly [number,number,number];readonly at:number;readonly delay:number};
}
export interface SummonState {
  id: string; spec: SceneSpec; requester: string; requestedAt: number; receipt: string; mode: "fixture" | "live";
}
export type LaneEvent = {type:"reactions";state:ReactionState} | { type: "version"; version: WorldVersion | null } | { type: "rounds"; state: RoundState } | { type: "summon"; summon: SummonState } | { type: "summon-remove"; ids: string[] } | { type: "reply"; message: string };
export type WorldEvent = (LaneEvent & { revision: number; now: number }) |
  { type: "snapshot"; revision: number; now: number; citizens: CitizenState[]; paused: boolean; raids: number; arrival: {raid:RaidEvent;admitted:number;at:number}|null; summons: SummonState[]; rounds: RoundState | null; version: WorldVersion | null; reactions?:ReactionState|null } |
  { type: "chat"; revision: number; now: number; chat: ChatEvent; citizen: CitizenState; spawned: boolean } |
  { type: "remove"; revision: number; now: number; ids: string[] } |
  { type: "raid"; revision: number; now: number; raid: RaidEvent; citizens: CitizenState[] } |
  { type: "control"; revision: number; now: number; action: "pause" | "skip" | "clear"; paused: boolean };

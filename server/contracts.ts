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

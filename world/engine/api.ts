import type { Group, Vector3 } from "three";
import type { ChatEvent, RaidEvent } from "../../server/contracts.js";
import type { SceneSpec } from "../../server/summon/scene-spec.js";

export interface Citizen {
  readonly id: string;
  readonly displayName: string;
  readonly color: string;
  readonly position: Readonly<Vector3>;
}

export interface SpawnHandle {
  readonly id: string;
  dispose(): void;
}

export interface WorldServices {
  /** Module-owned group only; the engine's root Scene is never exposed. */
  readonly scene: Group;
  readonly citizens: {
    get(id: string): Citizen | undefined;
    list(): readonly Citizen[];
  };
  readonly spawnSpec: (spec: SceneSpec) => SpawnHandle;
  readonly camera: {
    focus(position: Readonly<Vector3>, options?: { duration?: number; priority?: number }): void;
  };
  readonly effects: {
    play(name: "spawn" | "portal" | "sparkle", position: Readonly<Vector3>): void;
  };
  readonly log: (level: "info" | "warn" | "error", message: string) => void;
}

export interface WorldModule {
  readonly id: string;
  init(services: WorldServices): void;
  update(dt: number): void;
  onChat(event: Readonly<ChatEvent>): void;
  onCitizenSpawn(citizen: Citizen): void;
  onRaid(event: Readonly<RaidEvent>): void;
  dispose(): void;
}

export type WorldModuleFactory = () => WorldModule;

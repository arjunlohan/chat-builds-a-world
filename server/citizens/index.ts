import { CITIZEN_CAP } from "../../world/shared/limits.js";
import { isChatCommand } from "../commands.js";
import type { ChatEvent, CitizenCommand, CitizenState } from "../contracts.js";
import { hash, isWalkable, terrainHeight } from "../../world/engine/land.js";

export const CITIZEN_LIMIT = CITIZEN_CAP;
export const IDLE_MS = 20 * 60_000;
export const FADE_MS = 5000;
const homes: [number, number, number][] = [];
for (let z = -6.3; z <= 6.3; z += 0.63) {
  for (let x = -8.8; x <= 8.8; x += 0.63) {
    if (isWalkable(x, z)) homes.push([x, terrainHeight(x, z), z]);
  }
}
if (homes.length < CITIZEN_LIMIT) throw new Error("Not enough citizen homes in the island layout");

export function chatColor(input: string, id: string) {
  if (/^#[\da-f]{6}$/i.test(input)) return input;
  const colors = ["#e9a18e", "#80cbb4", "#a6b6e1", "#e3c277", "#d8a3c3", "#9bc77f"];
  return colors[hash(id) % colors.length]!;
}
export class CitizenRoster {
  private readonly citizens = new Map<string, CitizenState>();
  private readonly seats = new Map<string, number>();
  private readonly occupied = new Set<number>();
  get size() { return this.citizens.size; }
  list() { return [...this.citizens.values()]; }
  get(id: string) { return this.citizens.get(id); }

  accept(event: ChatEvent, now: number): { citizen: CitizenState; spawned: boolean } | undefined {
    const existing = this.citizens.get(event.userId);
    if (!existing && this.size >= CITIZEN_LIMIT) return;
    let home = existing?.home;
    if (!home) {
      let seat = hash(event.userId) % homes.length;
      while (this.occupied.has(seat)) seat = (seat + 1) % homes.length;
      this.seats.set(event.userId, seat); this.occupied.add(seat);
      home = Object.freeze([...homes[seat]!] as [number, number, number]);
    }
    let command: CitizenCommand | null = existing?.command ?? null;
    let commandAt = existing?.commandAt ?? 0;
    const text = event.text.trim();
    const simple = /^!(jump|dance|home)$/i.exec(text);
    if (simple) { command = { kind: simple[1]!.toLowerCase() as "jump" | "dance" | "home" }; commandAt = now; }
    const follow = /^!follow\s+@?(.{1,64})$/i.exec(text);
    if (follow) {
      const name = follow[1]!.toLocaleLowerCase();
      const target = this.list().find(c => c.displayName.toLocaleLowerCase() === name || c.id.toLocaleLowerCase() === name);
      if (target && target.id !== event.userId) { command = { kind: "follow", targetId: target.id }; commandAt = now; }
    }
    const citizen: CitizenState = Object.freeze({
      id: event.userId, displayName: event.displayName, color: chatColor(event.color, event.userId), home,
      lastActive: now, speech: isChatCommand(text) ? "" : text, speechAt: isChatCommand(text) ? 0 : now, command: command ? Object.freeze(command) : null, commandAt,
    });
    this.citizens.set(citizen.id, citizen);
    return { citizen, spawned: !existing };
  }

  prune(now: number) {
    const removed: string[] = [];
    for (const citizen of this.citizens.values()) {
      if (now - citizen.lastActive < IDLE_MS + FADE_MS) continue;
      this.citizens.delete(citizen.id);
      const seat = this.seats.get(citizen.id)!;
      this.occupied.delete(seat); this.seats.delete(citizen.id);
      removed.push(citizen.id);
    }
    return removed;
  }
}

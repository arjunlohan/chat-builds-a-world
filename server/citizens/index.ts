import { createHash } from "node:crypto";
import { RAID_ENTRY } from "../../world/shared/landmarks.js";
import { CITIZEN_CAP, IDLE_MS, FADE_MS, QUIET_MS, RAID_CAP } from "../../world/shared/limits.js";
import { isChatCommand, builtinCommand, hasPhysicalReaction } from "../commands.js";
import type { ChatEvent, CitizenCommand, CitizenState, RaidEvent } from "../contracts.js";
import { hash, isWalkable, terrainHeight } from "../../world/engine/land.js";

export const CITIZEN_LIMIT = CITIZEN_CAP;
const homes: [number, number, number][] = [];
for (let z = -6.3; z <= 6.3; z += 0.63) {
  for (let x = -8.8; x <= 8.8; x += 0.63) {
    if (isWalkable(x, z)) homes.push([x, terrainHeight(x, z), z]);
  }
}
if (homes.length < CITIZEN_LIMIT) throw new Error("Not enough citizen homes in the island layout");

export const homeSeat=(home:readonly number[])=>homes.findIndex(h=>h.every((n,i)=>n===home[i]));
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

  restore(saved: readonly CitizenState[]) {
    this.citizens.clear();this.seats.clear();this.occupied.clear();
    for(const value of saved){
      const seat=homeSeat(value.home);
      const citizen=Object.freeze({...value,home:Object.freeze([...value.home] as [number,number,number]),command:value.command?Object.freeze({...value.command}):null,...(value.entry?{entry:Object.freeze({...value.entry,from:Object.freeze([...value.entry.from] as [number,number,number])})}:{})});this.citizens.set(value.id,citizen);this.seats.set(value.id,seat);this.occupied.add(seat);
    }
  }
  private admit(desired: number, now: number) {
    const needed=Math.max(0,desired-(CITIZEN_LIMIT-this.size));
    const removed=needed?this.list().filter(c=>now-c.lastActive>=QUIET_MS).sort((a,b)=>a.lastActive-b.lastActive||a.id.localeCompare(b.id)).slice(0,needed).map(c=>c.id):[];
    this.remove(removed);return {removed,count:Math.min(desired,CITIZEN_LIMIT-this.size)};
  }
  private home(id: string) {
    let seat=hash(id)%homes.length;while(this.occupied.has(seat))seat=(seat+1)%homes.length;
    this.seats.set(id,seat);this.occupied.add(seat);return Object.freeze([...homes[seat]!] as [number,number,number]);
  }
  accept(event: ChatEvent, now: number): { citizen: CitizenState; spawned: boolean; removed:string[] } | undefined {
    const existing=this.citizens.get(event.userId),plan=existing?{removed:[],count:1}:this.admit(1,now);
    if(!plan.count)return;
    const home=existing?.home??this.home(event.userId);
    let command: CitizenCommand | null = existing?.command ?? null;
    let commandAt = existing?.commandAt ?? 0;
    const text = event.text.trim();
    const name=builtinCommand(text);
    const simple = name&&hasPhysicalReaction(text)&&name!=="follow"&&text.toLowerCase()===`!${name}`?name:undefined;
    if (simple) { command = { kind: simple as "jump" | "dance" | "home" }; commandAt = now; }
    const follow = /^!follow\s+@?(.{1,64})$/i.exec(text);
    if (follow) {
      const name = follow[1]!.toLocaleLowerCase();
      const target = this.list().find(c => c.displayName.toLocaleLowerCase() === name || c.id.toLocaleLowerCase() === name);
      if (target && target.id !== event.userId) { command = { kind: "follow", targetId: target.id }; commandAt = now; }
    }
    const citizen: CitizenState = Object.freeze({
      id: event.userId, displayName: event.displayName, color: chatColor(event.color, event.userId), home,
      lastActive: now, speech: isChatCommand(text) ? "" : text, speechAt: isChatCommand(text) ? 0 : now, command: command ? Object.freeze(command) : null, commandAt, ...(existing?.entry?{entry:existing.entry}:{}),
    });
    this.citizens.set(citizen.id, citizen);
    return { citizen, spawned: !existing, removed:plan.removed };
  }

  remove(ids: readonly string[]) {
    for(const id of ids){this.citizens.delete(id);const seat=this.seats.get(id);if(seat!==undefined)this.occupied.delete(seat);this.seats.delete(id);}
  }
  arrive(raid: RaidEvent, now: number) {
    const plan=this.admit(Math.min(RAID_CAP,raid.viewerCount),now);
    const citizens:CitizenState[]=[],prefix=createHash("sha256").update(raid.id).digest("hex").slice(0,24);
    for(let i=0;i<plan.count;i++){
      const id=`raid-${prefix}-${i}`,citizen:CitizenState=Object.freeze({id,displayName:`${raid.broadcasterName} · ${i+1}`.slice(0,64),color:chatColor("",raid.broadcasterId),home:this.home(id),lastActive:now,speech:"",speechAt:0,command:null,commandAt:0,entry:Object.freeze({from:Object.freeze([RAID_ENTRY.x,RAID_ENTRY.y,RAID_ENTRY.z] as [number,number,number]),at:now,delay:i*45})});
      this.citizens.set(id,citizen);citizens.push(citizen);
    }
    return {citizens,removed:plan.removed};
  }
  prune(now: number) {
    const removed:string[]=[];for(const citizen of this.citizens.values())if(now-citizen.lastActive>=IDLE_MS+FADE_MS)removed.push(citizen.id);this.remove(removed);return removed;
  }
}

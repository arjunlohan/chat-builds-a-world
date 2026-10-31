import { CITIZEN_CAP, IDLE_MS } from "../../world/shared/limits.js";
import type { CitizenState } from "../contracts.js";
/** Preserve recent chatters. Replace only the oldest idle seats needed by this raid. */
export function raidAdmission(citizens: readonly CitizenState[], viewers: number, now: number) {
 const desired=Math.min(150,Math.max(0,Math.floor(viewers))),free=Math.max(0,CITIZEN_CAP-citizens.length);
 const evictIds=citizens.filter(c=>now-c.lastActive>=IDLE_MS).sort((a,b)=>a.lastActive-b.lastActive||a.id.localeCompare(b.id)).slice(0,Math.max(0,desired-free)).map(c=>c.id);
 return {count:Math.min(desired,free+evictIds.length),evictIds};
}

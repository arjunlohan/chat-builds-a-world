import type {WorldVersion} from "./index.js";
export interface HistoryCredits {entries:{version:number;title:string;requester:string}[];viewers:number}
/** Restore activations are chapters, but never new viewer contributions. */
export function historyCredits(history:readonly WorldVersion[]):HistoryCredits {
 const shipped=new Map<number,HistoryCredits["entries"][number]>();
 for(const entry of history)if(entry.version>0&&entry.healthy===true&&entry.restoredFrom===undefined&&!shipped.has(entry.version))
  shipped.set(entry.version,{version:entry.version,title:entry.title,requester:entry.requester});
 const entries=[...shipped.values()].sort((a,b)=>a.version-b.version);
 return {entries,viewers:new Set(entries.map(entry=>entry.requester.trim().toLowerCase())).size};
}

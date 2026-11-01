import type {createRenderer} from "./renderer.js";
import type {WorldEvent} from "../../server/contracts.js";
export interface FrameCapture {readonly ready:Promise<void>;readonly frame:number;readonly time:number;step(dt:number):unknown}
declare global {interface Window {__capture?:FrameCapture}}
export function captureQuery(query:URLSearchParams){const seed=Number(query.get("seed")??1987);if(!Number.isSafeInteger(seed))throw new Error("Capture seed must be an integer");const raw=query.get("path"),path=raw==="orbit"||raw==="push-in"||raw==="flyover"?raw:"fixed";return {seed,path,...(query.get("module")?{moduleId:query.get("module")!}:{})} as const;}
export function captureUrl(query:URLSearchParams){const selected=new URLSearchParams({version:query.get("version")??"latest",take:query.get("take")??"default"});return `/api/capture?${selected}`;}
export function frameCapture(world:ReturnType<typeof createRenderer>,query:URLSearchParams):FrameCapture{
 let frame=0,time=0,loaded=false;
 const ready=(async()=>{const response=await fetch(captureUrl(query));if(!response.ok)throw new Error("Saved capture version is unavailable");const snapshot=await response.json() as Extract<WorldEvent,{type:"snapshot"}>;await world.loadCapture(snapshot);if(world.stats.moduleError||world.stats.moduleVersion!==(snapshot.version?.version??0))throw new Error(world.stats.moduleError||"Saved capture version failed to activate");loaded=true;})();
 return {ready,get frame(){return frame;},get time(){return time;},step(dt){if(!loaded)throw new Error("Await __capture.ready first");world.step(dt);time+=dt;frame++;return {frame,time};}};
}

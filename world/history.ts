import "./history.css";
import { createRenderer } from "./engine/renderer.js";
import type { HistoryEntry } from "../server/versions/index.js";
const byId=<T extends HTMLElement>(id:string)=>document.getElementById(id)! as T;
const canvas=byId<HTMLCanvasElement>("history-world"),message=byId("history-message"),player=byId("player"),play=byId<HTMLButtonElement>("play"),speed=byId<HTMLSelectElement>("speed");
const world=createRenderer(canvas,{playback:true,onReady(){canvas.dataset.ready="true";},onError(text){showError(text);}});
let entries:HistoryEntry[]=[],index=0,playing=!matchMedia("(prefers-reduced-motion: reduce)").matches,loading=false,elapsed=0,sequence=0,last=performance.now();
let progress="";
function setProgress(value:number){const next=`scaleX(${Math.min(1,value)})`;if(next!==progress){progress=next;byId("progress").style.transform=next;}}
const chapterMs=()=>8000/Number(speed.value);
function showError(text:string){playing=false;message.hidden=false;player.hidden=true;message.querySelector("h1")!.textContent="History couldn’t load";byId("message-detail").textContent=text;byId("retry").hidden=false;}
function status(){play.textContent=playing?"Pause":"Play";byId("playback-status").textContent=loading?"Loading chapter…":playing?"Playing":index===entries.length-1?"End of history":"Paused";}
async function show(next:number){
 const own=++sequence;index=next;elapsed=0;setProgress(0);loading=true;status();
 const entry=entries[index]!;byId("chapter-number").textContent=`CHAPTER ${index+1} · ${entry.tag}`;byId("chapter-title").textContent=entry.title;byId("chapter-requester").textContent=`Requested by @${entry.requester}`;byId("position").textContent=`${index+1} / ${entries.length}`;
 for(const [i,button] of [...byId("chapters").children].entries())button.setAttribute("aria-current",String(i===index));
 await world.setVersion({...entry,receipt:"history-playback"});if(own!==sequence)return;
 if(world.stats.moduleVersion!==entry.version||world.stats.moduleError){showError("This chapter could not activate. Try again or return to the live world.");return;}
 loading=false;status();
}
async function init(){
 try{const response=await fetch("/api/history");if(!response.ok)throw new Error();entries=(await response.json() as {versions:HistoryEntry[]}).versions;
 if(!entries.length){message.querySelector("h1")!.textContent="No versions yet";byId("message-detail").textContent="Shipped builds will appear here. Join the live world to help write its first chapter.";byId("chapter-count").textContent="0 shipped versions";return;}
 message.hidden=true;player.hidden=false;byId("chapter-count").textContent=`${entries.length} shipped ${entries.length===1?"version":"versions"} · ${entries[0]!.tag} to ${entries.at(-1)!.tag}`;
 for(const [i,entry] of entries.entries()){const button=document.createElement("button");button.type="button";button.textContent=entry.tag;button.setAttribute("aria-label",`${entry.tag}: ${entry.title}, requested by ${entry.requester}`);button.onclick=()=>{playing=false;void show(i);};byId("chapters").append(button);}
 await show(0);
 }catch{showError("The local history is unavailable. Try again or return to the live world.");}
}
play.onclick=()=>{playing=!playing;if(playing&&index===entries.length-1&&!loading)void show(0);status();};byId("replay").onclick=()=>{playing=true;void show(0);};byId("retry").onclick=()=>location.reload();
const timer=setInterval(()=>{const now=performance.now(),dt=now-last;last=now;if(!playing||loading||document.hidden||!entries.length)return;elapsed+=dt;if(elapsed>=chapterMs()){if(index+1<entries.length)void show(index+1);else{playing=false;status();}}setProgress(elapsed/chapterMs());},100);
window.addEventListener("pagehide",()=>{clearInterval(timer);world.dispose();},{once:true});void init();

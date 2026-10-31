import {randomUUID} from "node:crypto";
import {REACTIONS,clip} from "../reactions/catalog.js";
import {REACTION_MAX} from "../reactions/index.js";
import type {ReactionState} from "../reactions/index.js";
import {readConfig} from "../config.js";
const delay=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
async function main(){
 const base=`http://127.0.0.1:${readConfig().port}`,run=randomUUID().slice(0,8);
 const state=async()=>{const response=await fetch(base+"/api/world");const value=await response.json() as {reactions:ReactionState|null};if(!response.ok||!value.reactions)throw new Error("Reactions unavailable. Start pnpm dev with SIMULATION_ALLOWED=1.");if(value.reactions.paused)throw new Error("Reactions are paused by a moderator.");return value.reactions;};
 const post=async(path:string,body:unknown)=>{const response=await fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const value=await response.json() as {accepted?:boolean;reason?:string};if(!response.ok||!value.accepted)throw new Error(value.reason??`Simulation route ${path} unavailable; set SIMULATION_ALLOWED=1.`);};
 const chat=(user:number,text:string)=>post("/sim/chat",{id:`reaction-${randomUUID()}`,userId:`reaction-${run}-${user}`,displayName:`Reaction${user}`,color:["#E9A18E","#79D7BF","#B4ACE0"][user%3],text});
 const wait=async(accept:(s:ReactionState)=>boolean,limit=120_000)=>{const end=Date.now()+limit;while(Date.now()<end){const s=await state();if(accept(s))return s;await delay(150);}throw new Error("Reaction wait timed out; use a fresh fixture server with no competing chat.");};
 const started=Date.now();let total=0;
 console.log("Chat reactions: prerecorded clips, moderated /sim/chat path, real 20s windows and playback durations.");
 for(const r of REACTIONS){
  await wait(s=>!s.current&&!s.queued&&!s.vote&&s.meters.find(m=>m.id===r.id)!.cooldownUntil<=s.now);
  let fired:ReactionState|undefined,count=0;
  for(let i=0;i<REACTION_MAX;i++){
   await chat(i,r.triggers[0]);count++;total++;const s=await state();if(s.current?.clip===r.id||s.queued?.clip===r.id){fired=s;break;}
  }
  if(!fired)throw new Error(`${r.id} did not reach threshold`);
  console.log(`${r.id}: ${count} distinct viewers / threshold ${fired.threshold}; ${fired.current?.clip===r.id?"playing":"queued"} ${clip(r.id).seconds}s`);
 }
 await wait(s=>!s.current&&!s.queued&&!s.vote&&s.meters.some(m=>m.cooldownUntil<=s.now));
 // Simulation only opens the normal vote. Every ballot still enters through moderated chat.
 await post("/sim/reactions/vote",{});const vote=(await state()).vote!;await delay(300);
 await chat(0,"!react 1");await chat(1,"!react 2");await chat(2,"!react 2");await delay(300);await chat(0,"!react 2");total+=4;
 const before=await state();console.log(`Vote: ${vote.options.join(", ")}; counts [${before.vote!.counts.join(",")}], 3 voters (replacement counted once).`);
 const winner=await wait(s=>s.current?.source==="vote",35_000);if(winner.current!.clip!==vote.options[1])throw new Error("Wrong vote winner");
 console.log(`Vote winner: ${winner.current!.clip}; playing prerecorded clip.`);
 await wait(s=>!s.current&&!s.queued,10000);
 console.log(`PASS: 12 chat reactions + 1 vote, ${total} accepted messages, ${((Date.now()-started)/1000).toFixed(1)}s; takeover cleared.`);
}
void main().catch(error=>{console.error(error instanceof Error?error.message:"Reaction simulation failed");process.exitCode=1;});

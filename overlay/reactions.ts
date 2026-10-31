import {clip} from "../server/reactions/catalog.js";
import type {ReactionState} from "../server/reactions/index.js";
import {el,panel} from "./dom.js";
/** One video element, bounded by the authoritative clock as well as its native ended event. */
export function reactionOverlay(){
 const root=panel("Chat reactions","reaction-panel"),meters=el("div","reaction-meters"),vote=el("div","reaction-vote"),title=el("p","eyebrow","CHAT REACTIONS"),status=el("p","reaction-status"),video=el("video","reaction-takeover");
 root.append(title,meters,vote,status);root.hidden=true;video.hidden=true;video.muted=true;video.playsInline=true;video.preload="auto";video.setAttribute("aria-label","Prerendered chat reaction");
 let state:ReactionState|null=null,received=0,currentId=0,finishedId=0,layout="",disposed=false;
 const time=()=>state?state.now+(state.paused?0:performance.now()-received):0;
 function clear(){video.pause();video.hidden=true;video.removeAttribute("src");video.load();delete video.dataset.clip;}
 function finish(){finishedId=currentId;clear();}
 video.addEventListener("ended",finish);video.addEventListener("error",()=>{if(video.getAttribute("src"))finish();});
 function syncPlayback(){
  const current=state?.current,now=time();
  if(!current||current.endsAt<=now){if(!video.hidden)finish();return;}
  if(current.id===finishedId)return;
  if(current.id!==currentId){currentId=current.id;clear();video.dataset.clip=current.clip;video.src=clip(current.clip).url;video.hidden=false;video.load();}
  if(state!.paused)video.pause();else if(video.readyState>=1){
   const target=Math.max(0,(now-current.startedAt)/1000);
   if(Math.abs(video.currentTime-target)>.5)video.currentTime=Math.min(target,Number.isFinite(video.duration)?Math.max(0,video.duration-.02):target);
   if(video.paused)void video.play().catch(()=>{status.textContent="Playback unavailable";finish();});
  }
 }
 video.addEventListener("loadedmetadata",()=>{if(!disposed)syncPlayback();});
 function clock(){
  if(!state)return;const now=time();syncPlayback();
  const rows=state.meters.filter(m=>m.count>0&&m.cooldownUntil<=now).sort((a,b)=>b.count-a.count).slice(0,3);
  const next=JSON.stringify([rows,state.threshold,state.vote?.options,state.vote?.counts]);
  if(next!==layout){layout=next;meters.replaceChildren(...rows.map(m=>{const row=el("div","reaction-meter"),copy=el("p","reaction-copy",`${clip(m.id).label} charging ${m.count}/${state!.threshold}`),bar=el("progress");bar.max=state!.threshold;bar.value=m.count;bar.setAttribute("aria-label",copy.textContent!);row.append(copy,bar);return row;}));
   vote.replaceChildren();if(state.vote){vote.append(el("p","command","!react 1|2|3"));for(const [i,id] of state.vote.options.entries()){const row=el("div","reaction-option");row.append(el("span","",`${i+1}  ${clip(id).label}`),el("strong","",String(state.vote.counts[i])));vote.append(row);}}
  }
  root.hidden=!rows.length&&!state.vote&&!state.current&&!state.queued;
  status.textContent=state.paused?"PAUSED":state.vote?`${Math.max(0,Math.ceil((state.vote.endsAt-now)/1000))}s · ${state.vote.voters} voters`:state.queued?`Next: ${clip(state.queued.clip).label}`:state.current&&state.current.endsAt>now?`${clip(state.current.clip).label} · prerendered`:"20s chat window · distinct viewers";
 }
 return {root,video,clock,update(value:ReactionState){state=value;received=performance.now();clock();},dispose(){disposed=true;clear();}};
}

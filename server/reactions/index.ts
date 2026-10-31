import {CLIPS,REACTIONS,clip,matchReactions,type ClipId,type ReactionId} from "./catalog.js";
export const REACTION_WINDOW_MS=20_000, REACTION_ACTIVE_MS=120_000, REACTION_COOLDOWN_MS=90_000;
export const REACTION_MIN=3, REACTION_MAX=30, REACTION_RATIO=.35, REACTION_VIEWER_CAP=5000;
export const REACTION_VOTE_INTERVAL_MS=180_000, REACTION_VOTE_MS=30_000;
export const threshold=(active:number)=>Math.min(REACTION_MAX,Math.max(REACTION_MIN,Math.ceil(active*REACTION_RATIO)));
export interface Takeover {id:number;clip:ClipId;source:"chat"|"vote";startedAt:number;endsAt:number}
interface Vote {options:ClipId[];endsAt:number;ballots:[string,number][]}
export interface ReactionCheckpoint {now:number;paused:boolean;serial:number;nextVoteAt:number;active:[string,number][];charges:[ReactionId,[string,number][]][];cooldowns:[ClipId,number][];current:Takeover|null;queued:{clip:ClipId;source:"chat"|"vote"}|null;vote:Vote|null}
export interface ReactionState {now:number;paused:boolean;threshold:number;meters:{id:ReactionId;count:number;cooldownUntil:number}[];current:Takeover|null;queued:ReactionCheckpoint["queued"];vote:{options:ClipId[];endsAt:number;counts:number[];voters:number}|null;nextVoteAt:number}
/** Clock freezes with !pause. Only already-moderated messages may enter this service. */
export class Reactions {
 private time:number; private real:number; private paused=false; private serial=0; private nextVoteAt:number;
 private active=new Map<string,number>(); private charges=new Map<ReactionId,Map<string,number>>(REACTIONS.map(r=>[r.id,new Map()]));
 private cooldowns=new Map<ClipId,number>(); private current:Takeover|null=null; private queued:ReactionCheckpoint["queued"]=null; private vote:Vote|null=null;
 constructor(private readonly publish:(state:ReactionState)=>void,private readonly roundVoting:()=>boolean,private readonly now=Date.now,private readonly random=Math.random){this.time=this.real=now();this.nextVoteAt=this.time+REACTION_VOTE_INTERVAL_MS;}
 private clock(){const real=this.now();if(!this.paused)this.time+=Math.max(0,real-this.real);this.real=real;}
 private prune(){for(const [id,at] of this.active)if(this.time-at>=REACTION_ACTIVE_MS)this.active.delete(id);for(const entries of this.charges.values())for(const [id,at] of entries)if(this.time-at>=REACTION_WINDOW_MS)entries.delete(id);}
 private start(id:ClipId,source:"chat"|"vote"){this.current={id:++this.serial,clip:id,source,startedAt:this.time,endsAt:this.time+clip(id).seconds*1000};this.cooldowns.set(id,this.time+REACTION_COOLDOWN_MS);this.charges.get(id as ReactionId)?.clear();}
 private request(id:ClipId,source:"chat"|"vote"){
  if(this.current?.clip===id||this.queued?.clip===id)return;
  if(!this.current)this.start(id,source);
  else if(!this.queued||source==="vote"){this.queued={clip:id,source};this.charges.get(id as ReactionId)?.clear();}
 }
 private available(id:ClipId){return (this.cooldowns.get(id)??0)<=this.time&&this.current?.clip!==id&&this.queued?.clip!==id;}
 private advance(){
  this.prune();
  if(this.current&&this.current.endsAt<=this.time){this.current=null;if(this.queued){const queued=this.queued;this.queued=null;this.start(queued.clip,queued.source);}}
  if(this.vote&&this.roundVoting()){this.vote=null;this.nextVoteAt=this.time+REACTION_VOTE_INTERVAL_MS;}
  if(this.vote&&this.vote.endsAt<=this.time){const counts=this.counts(),winner=counts.indexOf(Math.max(...counts));if(this.vote.ballots.length)this.request(this.vote.options[winner]!,"vote");this.vote=null;this.nextVoteAt=this.time+REACTION_VOTE_INTERVAL_MS;}
  for(const r of REACTIONS)if(this.charges.get(r.id)!.size>=threshold(this.active.size)&&this.available(r.id)&&(!this.current||!this.queued))this.request(r.id,"chat");
  if(!this.vote&&this.time>=this.nextVoteAt&&!this.roundVoting())this.open();
 }
 private counts(){return this.vote?.options.map((_,i)=>this.vote!.ballots.filter(([,choice])=>choice===i).length)??[];}
 private open(){
  const pool=CLIPS.filter(c=>this.available(c.id)).map(c=>c.id);if(pool.length<3)return false;
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[pool[i],pool[j]]=[pool[j]!,pool[i]!];}
  this.vote={options:pool.slice(0,3),endsAt:this.time+REACTION_VOTE_MS,ballots:[]};return true;
 }
 openVote(){this.clock();if(this.paused)return false;this.advance();if(this.roundVoting()||this.vote)return false;const opened=this.open();if(opened)this.publish(this.snapshot());return opened;}
 chat(userId:string,text:string):{accepted:boolean;reason?:string}{
  this.clock();if(this.paused)return {accepted:false,reason:"paused"};this.advance();
  const command=/^!react(?:\s|$)/i.test(text.trim());
  if(command){const choice=/^!react\s+([123])\s*$/i.exec(text.trim());if(!choice||!this.vote||this.roundVoting())return {accepted:false,reason:"No reaction vote is open. Use !react 1|2|3 during a reaction vote."};
   const index=this.vote.ballots.findIndex(([id])=>id===userId),ballot:[string,number]=[userId,Number(choice[1])-1];
   if(index>=0)this.vote.ballots[index]=ballot;else if(this.vote.ballots.length<REACTION_VIEWER_CAP)this.vote.ballots.push(ballot);
  }
  if(!this.active.has(userId)&&this.active.size>=REACTION_VIEWER_CAP)this.active.delete(this.active.keys().next().value!);
  this.active.set(userId,this.time);
  if(!text.trim().startsWith("!"))for(const id of matchReactions(text)){const entries=this.charges.get(id)!;if(this.available(id)&&entries.size<REACTION_VIEWER_CAP)entries.set(userId,this.time);}
  this.advance();this.publish(this.snapshot());return {accepted:true};
 }
 setPaused(paused:boolean){this.clock();this.paused=paused;this.publish(this.snapshot());}
 tick(){const before=JSON.stringify({...this.snapshot(),now:0});this.clock();if(!this.paused)this.advance();const after=this.snapshot();if(before!==JSON.stringify({...after,now:0}))this.publish(after);}
 snapshot():ReactionState{return {now:this.time,paused:this.paused,threshold:threshold(this.active.size),meters:REACTIONS.map(r=>({id:r.id,count:this.charges.get(r.id)!.size,cooldownUntil:this.cooldowns.get(r.id)??0})),current:this.current?{...this.current}:null,queued:this.queued?{...this.queued}:null,vote:this.vote?{options:[...this.vote.options],endsAt:this.vote.endsAt,counts:this.counts(),voters:this.vote.ballots.length}:null,nextVoteAt:this.nextVoteAt};}
 checkpoint():ReactionCheckpoint{return {now:this.time,paused:this.paused,serial:this.serial,nextVoteAt:this.nextVoteAt,active:[...this.active],charges:[...this.charges].map(([id,entries])=>[id,[...entries]]),cooldowns:[...this.cooldowns],current:this.current,queued:this.queued,vote:this.vote};}
 restore(saved:ReactionCheckpoint,savedAt:number){this.real=this.now();this.time=saved.now+(saved.paused?0:Math.max(0,this.real-savedAt));this.paused=saved.paused;this.serial=saved.serial;this.nextVoteAt=saved.nextVoteAt;this.active=new Map(saved.active);this.charges=new Map(saved.charges.map(([id,entries])=>[id,new Map(entries)]));this.cooldowns=new Map(saved.cooldowns);this.current=saved.current;this.queued=saved.queued;this.vote=saved.vote;if(!this.paused)this.advance();}
}

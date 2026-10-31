import {CLIPS,REACTIONS} from "../reactions/catalog.js";
import {REACTION_VIEWER_CAP,type ReactionCheckpoint} from "../reactions/index.js";
import {Ajv2020} from "ajv/dist/2020.js";
import {parseSceneSpec,specUsage} from "../summon/scene-spec.js";
import {ResourceLedger,SUMMON_POOL,emptyUsage,RAID_CAP,CITIZEN_CAP,SUMMON_COUNT,WORLD_BOUNDS} from "../../world/shared/limits.js";
import {homeSeat} from "../citizens/index.js";
import type {WorldPipeline} from "../pipeline.js";
import {ROUND_CAPS} from "../rounds/index.js";
import type {Rounds} from "../rounds/index.js";
import type {SummonService} from "../summon/index.js";
export const CHECKPOINT_FORMAT=2;
export interface WorldCheckpoint {format:typeof CHECKPOINT_FORMAT;savedAt:number;value:{world:ReturnType<WorldPipeline["checkpoint"]>;rounds:ReturnType<Rounds["checkpoint"]>;summons:ReturnType<SummonService["checkpoint"]>}}
type WorldSource=WorldCheckpoint["value"]["world"];
type RoundSource=WorldCheckpoint["value"]["rounds"];
type SummonSource=WorldCheckpoint["value"]["summons"];
type S=Record<string,unknown>;
const string=(max=600):S=>({type:"string",maxLength:max}),number:S={type:"number",minimum:0},integer:S={type:"integer",minimum:0,maximum:Number.MAX_SAFE_INTEGER},boolean:S={type:"boolean"};
const one=(...values:unknown[]):S=>({enum:values}),nullable=(schema:S):S=>({anyOf:[schema,{type:"null"}]}),array=(items:S,maxItems?:number):S=>({type:"array",items,...(maxItems===undefined?{}:{maxItems})});
const object=<T extends object>(properties:{[K in keyof T]-?:S},optional:readonly (keyof T)[]=[]):S=>({type:"object",additionalProperties:false,properties,required:Object.keys(properties).filter(key=>!optional.includes(key as keyof T))});
const tuple=(...prefixItems:S[]):S=>({type:"array",prefixItems,minItems:prefixItems.length,maxItems:prefixItems.length,items:false});
const id:S={type:"string",minLength:1,maxLength:128,pattern:"^[a-zA-Z0-9_-]+$"},color:S={type:"string",pattern:"^#[a-fA-F0-9]{6}$"},position=tuple({type:"number",minimum:WORLD_BOUNDS.minX,maximum:WORLD_BOUNDS.maxX},{type:"number",minimum:WORLD_BOUNDS.minY,maximum:WORLD_BOUNDS.maxY},{type:"number",minimum:WORLD_BOUNDS.minZ,maximum:WORLD_BOUNDS.maxZ});
const pairs=(value:S,max=10000)=>array(tuple(id,value),max);
const command={anyOf:[object({kind:one("jump","dance","home")}),object({kind:one("follow"),targetId:id}),{type:"null"}]};
const citizen=object<WorldSource["citizens"][number]>({id,displayName:string(64),color,home:position,lastActive:number,speech:string(500),speechAt:number,command,commandAt:number,entry:object<NonNullable<WorldSource["citizens"][number]["entry"]>>({from:position,at:number,delay:{type:"number",minimum:0,maximum:30000}})},["entry"]);
const raid=object<NonNullable<WorldSource["arrival"]>["raid"]>({id,broadcasterId:id,broadcasterName:string(64),viewerCount:{type:"integer",minimum:1,maximum:1000000}});
const clipId=one(...CLIPS.map(c=>c.id)),reactionId=one(...REACTIONS.map(c=>c.id));
const takeover=object<NonNullable<ReactionCheckpoint["current"]>>({id:integer,clip:clipId,source:one("chat","vote"),startedAt:number,endsAt:number});
const reactionVote=object<NonNullable<ReactionCheckpoint["vote"]>>({options:{...array(clipId,3),minItems:3,uniqueItems:true},endsAt:number,ballots:pairs({type:"integer",minimum:0,maximum:2},REACTION_VIEWER_CAP)});
const reactions=object<ReactionCheckpoint>({now:number,paused:boolean,serial:integer,nextVoteAt:number,active:pairs(number,REACTION_VIEWER_CAP),charges:{...array(tuple(reactionId,pairs(number,REACTION_VIEWER_CAP)),REACTIONS.length),minItems:REACTIONS.length},cooldowns:array(tuple(clipId,number),CLIPS.length),current:nullable(takeover),queued:nullable(object<NonNullable<ReactionCheckpoint["queued"]>>({clip:clipId,source:one("chat","vote")})),vote:nullable(reactionVote)});
const world=object<WorldSource>({citizens:array(citizen,CITIZEN_CAP),revision:integer,paused:boolean,raids:integer,arrival:nullable(object<NonNullable<WorldSource["arrival"]>>({raid,admitted:{type:"integer",minimum:0,maximum:RAID_CAP},at:number})),seen:array(tuple(string(160),number),10000),replies:pairs(number),lastReply:nullable(number),reactions},["reactions"]);
const feed=object<RoundSource["build"]["lines"][number]>({id:integer,text:string(180),kind:one("plan","edit","check","ship","error")});
const build=object<RoundSource["build"]>({status:one("idle","reviewing","running","shipped","failed"),progress:{type:"number",minimum:0,maximum:100},completedAt:number,idea:string(180),requester:string(64),lines:array(feed,ROUND_CAPS.feed)},["completedAt"]);
const guard=object<RoundSource["guard"]>({status:one("idle","reviewing","accepted","rejected"),mode:one("live","fixture"),reason:string(),title:string(40),latencyMs:nullable(number)});
const idea=object<RoundSource["ideas"][number]>({id,text:string(180),requester:string(64),order:integer,supporters:array(id,ROUND_CAPS.backers)});
const version=object<RoundSource["timeline"][number]>({id:integer,version:integer,kind:one("ship","revert"),title:string(180),requester:string(64),reason:string()});
const toast=object<RoundSource["toasts"][number]>({id:integer,kind:one("summon","citizens","ship","revert","notice"),title:string(),detail:string(),expiresAt:number});
const rounds=object<RoundSource>({phase:one("ideas","voting","guarding","building","rollback"),round:{type:"integer",minimum:1},startedAt:number,endsAt:number,now:number,rate:{type:"number",minimum:1,maximum:15},simulation:boolean,paused:boolean,guard,build,timeline:array(version,ROUND_CAPS.timeline),toasts:array(toast,ROUND_CAPS.toasts),ideas:array(idea,ROUND_CAPS.ideas),votes:pairs(id,ROUND_CAPS.voters),shortlist:array(id,ROUND_CAPS.shortlist),winner:id,order:integer,serial:integer,version:integer,rollbackVotes:pairs(one("yes","no"),ROUND_CAPS.voters),rollbackRequester:string(64)},["winner"]);
const usage=nullable(object<NonNullable<SummonSource["jobs"][number]["public"]["usage"]>>({input:nullable(integer),output:nullable(integer),total:nullable(integer),reasoning:nullable(integer),cached:nullable(integer)}));
const job=object<SummonSource["jobs"][number]["public"]>({id,mode:one("fixture","live"),model:string(),effort:string(),tier:string(),status:one("generating","awaiting-render","rendered","failed","cleared"),requestedAt:number,validatedAt:nullable(number),providerMs:nullable(number),latencyMs:nullable(number),renderTimedOut:boolean,renderError:string(),valid:boolean,clamped:boolean,usage,reason:nullable(string())},["renderTimedOut","renderError"]);
const scene=object<SummonSource["scenes"][number]>({id,spec:{type:"object"},requester:string(64),requestedAt:number,receipt:string(128),mode:one("fixture","live")});
const summons=object<SummonSource>({scenes:array(scene,SUMMON_COUNT),jobs:array(object<SummonSource["jobs"][number]>({public:job,requester:string(64),userId:id,color:{anyOf:[color,one("")]},source:one("sim","twitch"),receipt:string(128)})),users:array(tuple(id,number)),lastGlobal:nullable(number)});
const unique=(values:readonly unknown[])=>new Set(values).size===values.length;
/** Shape has already been checked; these constraints explain unsafe references. */
export function references(saved:WorldCheckpoint):string|undefined {
 const {world,rounds,summons}=saved.value,citizens=world.citizens;
 if(!unique(citizens.map(c=>c.id)))return "duplicate citizen ID";
 if(!unique(citizens.map(c=>JSON.stringify(c.home))))return "duplicate citizen home";
 if(citizens.some(c=>homeSeat(c.home)<0))return "unknown citizen home";
 if(world.reactions){const r=world.reactions;
  if(r.paused!==world.paused)return "world and reaction pause state disagree";
  for(const entries of [r.active,r.cooldowns,...r.charges.map(([,entries])=>entries),r.vote?.ballots??[]])if(!unique(entries.map(([id])=>id)))return "duplicate reaction viewer or cooldown";
  if(!unique(r.charges.map(([id])=>id)))return "duplicate reaction charge meter";
  if(r.current&&(r.current.id>r.serial||r.current.endsAt<=r.current.startedAt))return "invalid reaction takeover";
  if(r.current?.clip===r.queued?.clip&&r.current)return "duplicate reaction takeover";
 }
 if(world.paused!==rounds.paused)return "world and round pause state disagree";
 for(const [name,entries] of [["seen",world.seen],["replies",world.replies],["votes",rounds.votes],["rollback votes",rounds.rollbackVotes],["summon cooldowns",summons.users]] as const)if(!unique(entries.map(([id])=>id)))return `duplicate ${name} owner`;
 const ideas=new Set(rounds.ideas.map(i=>i.id)),supporters=rounds.ideas.flatMap(i=>i.supporters);
 if(ideas.size!==rounds.ideas.length)return "duplicate idea ID";
 if(supporters.length>ROUND_CAPS.backers||!unique(supporters))return "invalid idea supporters";
 if(!unique(rounds.shortlist)||rounds.shortlist.some(id=>!ideas.has(id)))return "shortlist references an unknown or duplicate idea";
 if(rounds.votes.some(([,id])=>!rounds.shortlist.includes(id)))return "vote references an unknown candidate";
 if(rounds.winner&&!ideas.has(rounds.winner))return "winner references an unknown idea";
 const jobs=new Map(summons.jobs.map(j=>[j.public.id,j]));
 if(jobs.size!==summons.jobs.length||!unique(summons.scenes.map(s=>s.id)))return "duplicate summon ID";
 const ledger=new ResourceLedger(emptyUsage(),SUMMON_POOL);
 for(const scene of summons.scenes){
  if(jobs.get(scene.id)?.receipt!==scene.receipt)return "scene has no matching summon receipt";
  try{ledger.reserve(scene.id,specUsage(parseSceneSpec(JSON.stringify(scene.spec))));}catch{return "scene spec or resource admission is invalid";}
 }
}
const shape=new Ajv2020({strict:true,allErrors:false}).compile(object<WorldCheckpoint>({format:{const:CHECKPOINT_FORMAT},savedAt:integer,value:object<WorldCheckpoint["value"]>({world,rounds,summons})}));
export function checkpointFailure(value:unknown):string|undefined {
 if(!shape(value)){const error=shape.errors?.[0];return `schema validation failed at ${error?.instancePath||"/"}: ${error?.message??"invalid shape"}`;}
 return references(value as WorldCheckpoint);
}
export function validateWorldCheckpoint(value:unknown):value is WorldCheckpoint{return checkpointFailure(value)===undefined;}
/** Format 1 is upgraded in the loader, never inside an individual restorer. */
export function migrateWorldCheckpoint(input:unknown,fromFormat:number):unknown{
 if(fromFormat!==1)return input;
 const saved=structuredClone(input) as WorldCheckpoint&{format:number};if(!saved?.value)return input;
 const source=saved.value as unknown as {world:Record<string,unknown>;rounds:Record<string,unknown>;summons:unknown},round=source.rounds;
 if(round&&"state" in round){const state=round.state as Record<string,unknown>;
  source.rounds={...round,...Object.fromEntries(["phase","round","startedAt","endsAt","now","simulation","paused","guard","build","timeline","toasts"].map(key=>[key,state[key]])),rate:state.clockRate,rollbackRequester:(state.rollback as {requester:string}|null)?.requester??""};
  delete source.rounds.state;
  source.rounds.ideas=(source.rounds.ideas as Record<string,unknown>[]).map(({normalized:_normalized,...idea})=>idea);
 }
 if(source.world)delete source.world.cooldowns;
 return {...saved,format:CHECKPOINT_FORMAT};
}

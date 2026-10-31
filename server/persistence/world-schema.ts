import {Ajv2020} from "ajv/dist/2020.js";
import canonical from "../summon/scene-spec.schema.json";
import {parseSceneSpec,specUsage} from "../summon/scene-spec.js";
import {ResourceLedger,SUMMON_POOL,emptyUsage,RAID_CAP} from "../../world/shared/limits.js";
import {homeSeat} from "../citizens/index.js";
import type {WorldPipeline} from "../pipeline.js";
import type {Rounds} from "../rounds/index.js";
import type {SummonService} from "../summon/index.js";
export interface WorldCheckpoint {format:2;savedAt:number;value:{world:ReturnType<WorldPipeline["checkpoint"]>;rounds:ReturnType<Rounds["checkpoint"]>;summons:ReturnType<SummonService["checkpoint"]>}}
type S=Record<string,unknown>;
const string=(max=600):S=>({type:"string",maxLength:max}),number:S={type:"number",minimum:0},integer:S={type:"integer",minimum:0,maximum:Number.MAX_SAFE_INTEGER},boolean:S={type:"boolean"};
const one=(...values:unknown[]):S=>({enum:values}),nullable=(schema:S):S=>({anyOf:[schema,{type:"null"}]}),array=(items:S,maxItems:number):S=>({type:"array",items,maxItems});
const object=(properties:Record<string,S>,optional:string[]=[]):S=>({type:"object",additionalProperties:false,properties,required:Object.keys(properties).filter(key=>!optional.includes(key))});
const tuple=(...prefixItems:S[]):S=>({type:"array",prefixItems,minItems:prefixItems.length,maxItems:prefixItems.length,items:false});
const id:S={type:"string",minLength:1,maxLength:128,pattern:"^[a-zA-Z0-9_-]+$"},color:S={type:"string",pattern:"^#[a-fA-F0-9]{6}$"},position=tuple({type:"number",minimum:-64,maximum:64},{type:"number",minimum:-8,maximum:48},{type:"number",minimum:-64,maximum:64});
const pairs=(value:S,max=10000)=>array(tuple(id,value),max);
const command={anyOf:[object({kind:one("jump","dance","home")}),object({kind:one("follow"),targetId:id}),{type:"null"}]};
const citizen=object({id,displayName:string(64),color,home:position,lastActive:number,speech:string(500),speechAt:number,command,commandAt:number,entry:object({from:position,at:number,delay:{type:"number",minimum:0,maximum:30000}})},["entry"]);
const raid=object({id,broadcasterId:id,broadcasterName:string(64),viewerCount:{type:"integer",minimum:1,maximum:1000000}});
const world=object({citizens:array(citizen,300),revision:integer,paused:boolean,raids:integer,arrival:nullable(object({raid,admitted:{type:"integer",minimum:0,maximum:RAID_CAP},at:number})),seen:array(tuple(string(160),number),10000),replies:pairs(number),lastReply:nullable(number)});
const feed=object({id:integer,text:string(180),kind:one("plan","edit","check","ship","error")});
const build=object({status:one("idle","reviewing","running","shipped","failed"),progress:{type:"number",minimum:0,maximum:100},completedAt:number,idea:string(180),requester:string(64),lines:array(feed,64)},["completedAt"]);
const guard=object({status:one("idle","reviewing","accepted","rejected"),mode:one("live","fixture"),reason:string(),title:string(40),latencyMs:nullable(number)});
const idea=object({id,text:string(180),requester:string(64),order:integer,supporters:array(id,5000)});
const version=object({id:integer,version:integer,kind:one("ship","revert"),title:string(180),requester:string(64),reason:string()});
const toast=object({id:integer,kind:one("summon","citizens","ship","revert","notice"),title:string(),detail:string(),expiresAt:number});
const rounds=object({phase:one("ideas","voting","guarding","building","rollback"),round:{type:"integer",minimum:1},startedAt:number,endsAt:number,now:number,rate:{type:"number",minimum:1,maximum:15},simulation:boolean,paused:boolean,guard,build,timeline:array(version,12),toasts:array(toast,8),ideas:array(idea,100),votes:pairs(id,5000),shortlist:array(id,3),winner:id,order:integer,serial:integer,version:integer,rollbackVotes:pairs(one("yes","no"),5000),rollbackRequester:string(64)},["winner"]);
const usage=nullable(object({input:nullable(integer),output:nullable(integer),total:nullable(integer),reasoning:nullable(integer),cached:nullable(integer)}));
const job=object({id,mode:one("fixture","live"),model:string(),effort:string(),tier:string(),status:one("generating","awaiting-render","rendered","failed","cleared"),requestedAt:number,validatedAt:nullable(number),providerMs:nullable(number),latencyMs:nullable(number),renderTimedOut:boolean,renderError:string(),valid:boolean,clamped:boolean,usage,reason:nullable(string())},["renderTimedOut","renderError"]);
const scene=object({id,spec:{$ref:canonical.$id},requester:string(64),requestedAt:number,receipt:string(128),mode:one("fixture","live")});
const summons=object({scenes:array(scene,24),jobs:array(object({public:job,requester:string(64),userId:id,color:{anyOf:[color,one("")]},source:one("sim","twitch"),receipt:string(128)}),1000),users:pairs(number,1000),lastGlobal:nullable(number)});
const unique=(values:readonly unknown[])=>new Set(values).size===values.length;
/** Relational constraints are part of the same root Ajv validation, before any restore. */
function indexes(_enabled:boolean,saved:WorldCheckpoint){
 try{
  const {world,rounds,summons}=saved.value,citizens=world.citizens;
  if(!unique(citizens.map(c=>c.id))||!unique(citizens.map(c=>JSON.stringify(c.home)))||citizens.some(c=>homeSeat(c.home)<0)||world.paused!==rounds.paused)return false;
  for(const entries of [world.seen,world.replies,rounds.votes,rounds.rollbackVotes,summons.users])if(!unique(entries.map(([id])=>id)))return false;
  const ideas=new Set(rounds.ideas.map(i=>i.id)),supporters=rounds.ideas.flatMap(i=>i.supporters);
  if(ideas.size!==rounds.ideas.length||supporters.length>5000||!unique(supporters)||!unique(rounds.shortlist)||rounds.shortlist.some(id=>!ideas.has(id))||rounds.votes.some(([,id])=>!rounds.shortlist.includes(id))||(rounds.winner&&!ideas.has(rounds.winner)))return false;
  const jobs=new Map(summons.jobs.map(j=>[j.public.id,j]));if(jobs.size!==summons.jobs.length||!unique(summons.scenes.map(s=>s.id)))return false;
  const ledger=new ResourceLedger(emptyUsage(),SUMMON_POOL);
  for(const scene of summons.scenes){if(jobs.get(scene.id)?.receipt!==scene.receipt)return false;ledger.reserve(scene.id,specUsage(parseSceneSpec(JSON.stringify(scene.spec))));}
  return true;
 }catch{return false;}
}
const ajv=new Ajv2020({strict:true,allErrors:false});ajv.addSchema(canonical);ajv.addKeyword({keyword:"worldIndexes",schemaType:"boolean",type:"object",errors:false,validate:indexes});
export const validateWorldCheckpoint=ajv.compile({allOf:[object({format:{const:2},savedAt:integer,value:object({world,rounds,summons})}),{type:"object",worldIndexes:true}]});
/** Format 1 is upgraded in the loader, never inside an individual restorer. */
export function migrateWorldCheckpoint(input:unknown):unknown{
 const saved=structuredClone(input) as WorldCheckpoint&{format:number};if(!saved?.value)return input;
 const source=saved.value as unknown as {world:Record<string,unknown>;rounds:Record<string,unknown>;summons:unknown},round=source.rounds;
 if(round&&"state" in round){const state=round.state as Record<string,unknown>;
  source.rounds={...round,...Object.fromEntries(["phase","round","startedAt","endsAt","now","simulation","paused","guard","build","timeline","toasts"].map(key=>[key,state[key]])),rate:state.clockRate,rollbackRequester:(state.rollback as {requester:string}|null)?.requester??""};
  delete source.rounds.state;
  source.rounds.ideas=(source.rounds.ideas as Record<string,unknown>[]).map(({normalized:_normalized,...idea})=>idea);
 }
 if(source.world)delete source.world.cooldowns;
 return {...saved,format:2};
}

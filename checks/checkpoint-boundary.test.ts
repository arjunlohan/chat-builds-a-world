import assert from "node:assert/strict";
import {test} from "node:test";
import {mkdtemp,writeFile,readFile,readdir,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {WorldPipeline} from "../server/pipeline.js";
import {Rounds} from "../server/rounds/index.js";
import {SummonService} from "../server/summon/index.js";
import {fixtureProvider} from "../server/summon/provider.js";
import {Checkpoint} from "../server/persistence/checkpoint.js";
import {CHECKPOINT_FORMAT,checkpointFailure,validateWorldCheckpoint,migrateWorldCheckpoint,type WorldCheckpoint} from "../server/persistence/world-schema.js";
const chat=(id:string,text:string)=>({id,userId:id,displayName:id,color:"#79D7CF",text,timestamp:Date.now()});
async function fixture(){const world=new WorldPipeline(),rounds=new Rounds({publish:state=>world.publish({type:"rounds",state})});world.attachRounds(rounds);const summons=new SummonService({config:{model:"fixture",effort:"max",tier:"ultrafast"},mode:"fixture",provider:fixtureProvider,publish:event=>world.publish(event),reply(){},record(){}});world.attachSummon(summons);world.chat(chat("maker","!idea A lantern"));rounds.skip();world.chat(chat("voter","!vote 1"));await summons.submit(chat("summoner","!summon a jellyfish"));return {world,rounds,summons,saved:{format:CHECKPOINT_FORMAT,savedAt:Date.now(),value:{world:world.checkpoint(),rounds:rounds.checkpoint(),summons:summons.checkpoint()}} as WorldCheckpoint};}
test("one checkpoint schema accepts live source state and rejects malformed fields and references",async()=>{
 const f=await fixture();try{assert.equal(validateWorldCheckpoint(f.saved),true,checkpointFailure(f.saved));
 const edits=[(s:WorldCheckpoint)=>{s.value.rounds.votes=[["voter","missing"]];},(s:WorldCheckpoint)=>{s.value.world.citizens[0]={...s.value.world.citizens[0]!,home:[1,99,1]};},(s:WorldCheckpoint)=>{s.value.summons.jobs=[];},(s:WorldCheckpoint)=>{s.value.rounds.shortlist=["missing"];},(s:WorldCheckpoint)=>{s.value.world.citizens.push(s.value.world.citizens[0]!);},(s:WorldCheckpoint)=>{Object.assign(s.value.rounds,{votes:"invalid"});}];for(const edit of edits){const saved=structuredClone(f.saved);edit(saved);assert.equal(validateWorldCheckpoint(saved),false);}
 }finally{f.rounds.dispose();}
});
test("invalid checkpoint is quarantined before restoration; a fresh checkpoint can be written",async()=>{
 const root=await mkdtemp(join(tmpdir(),"checkpoint-boundary-")),f=await fixture(),path=join(root,"world.json"),warnings:string[]=[];try{
 const damaged=structuredClone(f.saved);Object.assign(damaged.value.summons,{jobs:null});const bytes=JSON.stringify(damaged);await writeFile(path,bytes);const cp=new Checkpoint(path,()=>f.saved.value,CHECKPOINT_FORMAT),saved=await cp.load({validate:checkpointFailure,migrate:migrateWorldCheckpoint,warn:m=>warnings.push(m)});let restored=0;if(saved){restored++;f.world.restore(saved.world);f.rounds.restore(saved.rounds);f.summons.restore(saved.summons);}assert.equal(restored,0);assert.equal(f.world.roster.size,2);assert.equal(warnings.length,1);assert.match(warnings[0]!,/schema validation failed.*preserved.*Starting fresh/);const quarantined=(await readdir(root)).find(p=>p.includes(".invalid-"))!;assert.equal(await readFile(join(root,quarantined),"utf8"),bytes);cp.changed();await cp.flush();assert.equal(validateWorldCheckpoint(JSON.parse(await readFile(path,"utf8"))),true);
 }finally{f.rounds.dispose();await rm(root,{recursive:true,force:true});}
});
test("format 1 migration happens in Checkpoint.load and writes a validated format 2 file",async()=>{
 const root=await mkdtemp(join(tmpdir(),"checkpoint-upgrade-")),f=await fixture(),path=join(root,"world.json");try{
 const legacy={...f.saved,format:1,value:{...f.saved.value,world:{...f.saved.value.world,cooldowns:[]},rounds:{state:f.rounds.snapshot(),ideas:f.saved.value.rounds.ideas.map(i=>({...i,normalized:"old-derived-index"})),votes:f.saved.value.rounds.votes,shortlist:f.saved.value.rounds.shortlist,winner:f.saved.value.rounds.winner,order:f.saved.value.rounds.order,serial:f.saved.value.rounds.serial,version:f.saved.value.rounds.version,rollbackVotes:f.saved.value.rounds.rollbackVotes}}};await writeFile(path,JSON.stringify(legacy));const cp=new Checkpoint(path,()=>f.saved.value,CHECKPOINT_FORMAT),loaded=await cp.load({validate:checkpointFailure,migrate:migrateWorldCheckpoint,warn:message=>assert.fail(message)});assert.equal(loaded!.rounds.votes.length,1);assert.ok(!("state" in loaded!.rounds));assert.ok(!("cooldowns" in loaded!.world));assert.equal(validateWorldCheckpoint(JSON.parse(await readFile(path,"utf8"))),true);
 }finally{f.rounds.dispose();await rm(root,{recursive:true,force:true});}
});
test("unsupported checkpoint format is preserved and rejected clearly",async()=>{
 const root=await mkdtemp(join(tmpdir(),"checkpoint-format-")),path=join(root,"world.json"),warnings:string[]=[];try{await writeFile(path,JSON.stringify({format:99,savedAt:0,value:{}}));const cp=new Checkpoint(path,()=>({}),CHECKPOINT_FORMAT);assert.equal(await cp.load({warn:message=>warnings.push(message)}),undefined);assert.match(warnings[0]!,/Unsupported checkpoint format/);assert.equal((await readdir(root)).filter(p=>p.includes(".invalid-")).length,1);}finally{await rm(root,{recursive:true,force:true});}
});

test("live lifecycle checkpoints cover every optional persisted field",async()=>{
 let ready!:()=>void;const buildingReady=new Promise<void>(resolve=>ready=resolve);
 let now=Date.now(),finish!:(value:import('../server/runner/index.js').RunResult)=>void;const world=new WorldPipeline(()=>now),{fixtureReview}=await import('../server/guard/index.js');
 const rounds=new Rounds({now:()=>now,publish:state=>world.publish({type:'rounds',state}),review:fixtureReview,build:()=>{ready();return new Promise(resolve=>finish=resolve);}});world.attachRounds(rounds);
 const summons=new SummonService({now:()=>now,config:{model:'fixture',effort:'max',tier:'ultrafast'},mode:'fixture',provider:fixtureProvider,publish:event=>world.publish(event),reply(){},record(){}});world.attachSummon(summons);
 const capture=()=>({format:CHECKPOINT_FORMAT,savedAt:now,value:{world:world.checkpoint(),rounds:rounds.checkpoint(),summons:summons.checkpoint()}});
 try{
 world.chat(chat('maker','!idea Grow a lantern orchard by the lake'));rounds.skip();rounds.skip();await buildingReady;
 world.raid({id:'raid-optional',broadcasterId:'raider',broadcasterName:'Crew',viewerCount:1});
 await summons.submit(chat('wish-one','!summon a jellyfish'));now+=31000;summons.prune();const first=summons.active()[0]!;await summons.acknowledge(first.id,first.receipt,'allocation');
 const good=await summons.submit(chat('wish-two','!summon a crystal'));const second=summons.active()[0]!;now+=1;await summons.acknowledge(good.id,second.receipt);
 const building=capture();assert.ok(building.value.rounds.winner);assert.ok(building.value.world.citizens.some(c=>c.entry));assert.ok(building.value.summons.jobs.some(j=>j.public.renderTimedOut&&j.public.renderError));assert.equal(validateWorldCheckpoint(JSON.parse(JSON.stringify(building))),true,checkpointFailure(building));
 finish({ok:true,outcome:'SHIPPED',reason:'Fixture',durationMs:1,tokens:{input:0,output:0,total:0},version:1});await new Promise(resolve=>setImmediate(resolve));
 const completed=capture();assert.ok(completed.value.rounds.build.completedAt);assert.equal(validateWorldCheckpoint(JSON.parse(JSON.stringify(completed))),true,checkpointFailure(completed));
 const restoredWorld=new WorldPipeline(()=>now),restoredRounds=new Rounds({now:()=>now,publish(){}});restoredWorld.restore(completed.value.world);restoredRounds.restore(completed.value.rounds,now);assert.deepEqual(restoredWorld.checkpoint(),completed.value.world);assert.deepEqual(restoredRounds.checkpoint(),completed.value.rounds);restoredRounds.dispose();
 }finally{rounds.dispose();}
});

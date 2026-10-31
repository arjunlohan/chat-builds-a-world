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
import {validateWorldCheckpoint,migrateWorldCheckpoint,type WorldCheckpoint} from "../server/persistence/world-schema.js";
const chat=(id:string,text:string)=>({id,userId:id,displayName:id,color:"#79D7CF",text,timestamp:Date.now()});
async function fixture(){const world=new WorldPipeline(),rounds=new Rounds({publish:state=>world.publish({type:"rounds",state})});world.attachRounds(rounds);const summons=new SummonService({config:{model:"fixture",effort:"max",tier:"ultrafast"},mode:"fixture",provider:fixtureProvider,publish:event=>world.publish(event),reply(){},record(){}});world.attachSummon(summons);world.chat(chat("maker","!idea A lantern"));rounds.skip();world.chat(chat("voter","!vote 1"));await summons.submit(chat("summoner","!summon a jellyfish"));return {world,rounds,summons,saved:{format:2,savedAt:Date.now(),value:{world:world.checkpoint(),rounds:rounds.checkpoint(),summons:summons.checkpoint()}} as WorldCheckpoint};}
test("one checkpoint schema accepts live source state and rejects malformed fields and references",async()=>{
 const f=await fixture();try{assert.equal(validateWorldCheckpoint(f.saved),true,JSON.stringify(validateWorldCheckpoint.errors));
 const edits=[(s:WorldCheckpoint)=>{s.value.rounds.votes=[["voter","missing"]];},(s:WorldCheckpoint)=>{s.value.world.citizens[0]={...s.value.world.citizens[0]!,home:[1,99,1]};},(s:WorldCheckpoint)=>{s.value.summons.jobs=[];},(s:WorldCheckpoint)=>{s.value.rounds.shortlist=["missing"];},(s:WorldCheckpoint)=>{s.value.world.citizens.push(s.value.world.citizens[0]!);},(s:WorldCheckpoint)=>{Object.assign(s.value.rounds,{votes:"invalid"});}];for(const edit of edits){const saved=structuredClone(f.saved);edit(saved);assert.equal(validateWorldCheckpoint(saved),false);}
 }finally{f.rounds.dispose();}
});
test("invalid checkpoint is quarantined before restoration; a fresh checkpoint can be written",async()=>{
 const root=await mkdtemp(join(tmpdir(),"checkpoint-boundary-")),f=await fixture(),path=join(root,"world.json"),warnings:string[]=[];try{
 const damaged=structuredClone(f.saved);Object.assign(damaged.value.summons,{jobs:null});const bytes=JSON.stringify(damaged);await writeFile(path,bytes);const cp=new Checkpoint(path,()=>f.saved.value),saved=await cp.load({validate:validateWorldCheckpoint,migrate:migrateWorldCheckpoint,warn:m=>warnings.push(m)});let restored=0;if(saved){restored++;f.world.restore(saved.world);f.rounds.restore(saved.rounds);f.summons.restore(saved.summons);}assert.equal(restored,0);assert.equal(f.world.roster.size,2);assert.equal(warnings.length,1);assert.match(warnings[0]!,/schema validation failed.*preserved.*Starting fresh/);const quarantined=(await readdir(root)).find(p=>p.includes(".invalid-"))!;assert.equal(await readFile(join(root,quarantined),"utf8"),bytes);cp.changed();await cp.flush();assert.equal(validateWorldCheckpoint(JSON.parse(await readFile(path,"utf8"))),true);
 }finally{f.rounds.dispose();await rm(root,{recursive:true,force:true});}
});
test("format 1 migration happens in Checkpoint.load and writes a validated format 2 file",async()=>{
 const root=await mkdtemp(join(tmpdir(),"checkpoint-upgrade-")),f=await fixture(),path=join(root,"world.json");try{
 const legacy={...f.saved,format:1,value:{...f.saved.value,world:{...f.saved.value.world,cooldowns:[]},rounds:{state:f.rounds.snapshot(),ideas:f.saved.value.rounds.ideas.map(i=>({...i,normalized:"old-derived-index"})),votes:f.saved.value.rounds.votes,shortlist:f.saved.value.rounds.shortlist,winner:f.saved.value.rounds.winner,order:f.saved.value.rounds.order,serial:f.saved.value.rounds.serial,version:f.saved.value.rounds.version,rollbackVotes:f.saved.value.rounds.rollbackVotes}}};await writeFile(path,JSON.stringify(legacy));const cp=new Checkpoint(path,()=>f.saved.value),loaded=await cp.load({validate:validateWorldCheckpoint,migrate:migrateWorldCheckpoint,warn:message=>assert.fail(message)});assert.equal(loaded!.rounds.votes.length,1);assert.ok(!("state" in loaded!.rounds));assert.ok(!("cooldowns" in loaded!.world));assert.equal(validateWorldCheckpoint(JSON.parse(await readFile(path,"utf8"))),true);
 }finally{f.rounds.dispose();await rm(root,{recursive:true,force:true});}
});
test("unsupported checkpoint format is preserved and rejected clearly",async()=>{
 const root=await mkdtemp(join(tmpdir(),"checkpoint-format-")),path=join(root,"world.json"),warnings:string[]=[];try{await writeFile(path,JSON.stringify({format:99,savedAt:0,value:{}}));const cp=new Checkpoint(path,()=>({}));assert.equal(await cp.load({warn:message=>warnings.push(message)}),undefined);assert.match(warnings[0]!,/Unsupported checkpoint format/);assert.equal((await readdir(root)).filter(p=>p.includes(".invalid-")).length,1);}finally{await rm(root,{recursive:true,force:true});}
});

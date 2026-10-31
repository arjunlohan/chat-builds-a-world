import assert from "node:assert/strict";
import {test} from "node:test";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {Checkpoint} from "../server/persistence/checkpoint.js";
import {acquireLock} from "../server/runtime/lock.js";
import {WorldPipeline} from "../server/pipeline.js";
import {Rounds,DEMO_MS,ROUND_MS} from "../server/rounds/index.js";
import {SummonService} from "../server/summon/index.js";
import {fixtureProvider} from "../server/summon/provider.js";
import type {GuardResult} from "../server/guard/index.js";
const chat=(id:string,text:string)=>({id,userId:id,displayName:id,color:"#79D7CF",text,timestamp:0});
test("atomic checkpoints coalesce bursts, recover data and reject malformed state",async()=>{
 const root=await mkdtemp(join(tmpdir(),"checkpoint-"));let value=0,captures=0;const checkpoint=new Checkpoint(join(root,"world.json"),()=>{captures++;return {value};});
 try{for(let i=0;i<1000;i++){value=i;checkpoint.changed();}await checkpoint.flush();assert.equal(captures,1);assert.deepEqual(await checkpoint.load(),{value:999});assert.equal(JSON.parse(await readFile(join(root,"world.json"),"utf8")).format,2);await checkpoint.flush();await writeFile(join(root,"world.json"),"broken");assert.equal(await checkpoint.load({warn(){}}),undefined);}finally{await rm(root,{recursive:true,force:true});}
});
test("process lock excludes another owner and reclaims dead owners",async()=>{
 const root=await mkdtemp(join(tmpdir(),"flight-lock-"));try{const release=await acquireLock(root);await assert.rejects(acquireLock(root),/Another server/);await release();await writeFile(join(root,"state/server.lock"),JSON.stringify({pid:99999999,token:"dead"}));const next=await acquireLock(root);await next();}finally{await rm(root,{recursive:true,force:true});}
});
test("world and vote checkpoints preserve roster, replacement ballots and paused time",()=>{
 let now=1000;const pipeline=new WorldPipeline(()=>now),rounds=new Rounds({now:()=>now,publish(){}});pipeline.attachRounds(rounds);pipeline.chat(chat("one","!idea A small lantern"));pipeline.chat(chat("two","!idea A jade arch"));rounds.skip();pipeline.chat(chat("voter","!vote 1"));now+=1000;rounds.setPaused(true);const world=pipeline.checkpoint(),state=rounds.checkpoint();now+=50000;
 const restoredPipeline=new WorldPipeline(()=>now),restored=new Rounds({now:()=>now,publish(){}});restoredPipeline.restore(world);restored.restore(state);assert.deepEqual(restoredPipeline.roster.list(),pipeline.roster.list());assert.equal(restored.snapshot().round,state.round);assert.equal(restored.snapshot().phase,"voting");assert.equal(restored.snapshot().paused,true);assert.equal(restored.snapshot().endsAt-restored.snapshot().now,state.endsAt-state.now);restored.setPaused(false);restored.command({...chat("replace","!vote 2"),userId:"voter"});assert.equal(restored.snapshot().totalVotes,1);assert.deepEqual(restored.snapshot().candidates.map(c=>c.votes),[0,1]);rounds.dispose();restored.dispose();
});
test("veto works mid-build, refuses viewer authority and restart never replays providers",async()=>{
 let now=0,signal:AbortSignal|undefined,calls=0;const accepted:GuardResult={verdict:"accept",reason:"Safe",title:"Lantern",spec:{moduleId:"lantern",description:"Small visual",steps:["Create"],checks:["Clean"],estimatedSeconds:60},files:["world/modules/lantern.ts"],mode:"fixture",latencyMs:0};
 const pipeline=new WorldPipeline(()=>now),rounds=new Rounds({now:()=>now,review:()=>accepted,build:request=>{signal=request.signal;return new Promise(()=>{});},publish(){}});pipeline.attachRounds(rounds);pipeline.chat(chat("idea","!idea A lantern"));rounds.skip();rounds.skip();assert.equal(rounds.snapshot().phase,"building");const saved=rounds.checkpoint();assert.equal(pipeline.chat(chat("viewer","!veto")).accepted,false);now+=300;assert.equal(pipeline.chat(chat("mod","!veto"),{moderator:true}).accepted,true);assert.equal(signal!.aborted,true);assert.equal(rounds.snapshot().phase,"ideas");
 const restored=new Rounds({now:()=>now,review:()=>{calls++;return accepted;},build:async()=>{calls++;throw new Error("must not replay");},publish(){}});restored.restore(saved);assert.equal(calls,0);assert.equal(restored.snapshot().round,saved.round);assert.equal(restored.snapshot().phase,"ideas");assert.equal(restored.snapshot().build.status,"failed");restored.dispose();rounds.dispose();
});
test("summon state restores scenes and original receipts without provider calls",async()=>{
 const options={config:{model:"fixture",effort:"max",tier:"ultrafast"},provider:fixtureProvider,mode:"fixture" as const,publish(){},reply(){},record(){}};const first=new SummonService(options);await first.submit(chat("summoner","!summon a jellyfish"));const saved=first.checkpoint(),restored=new SummonService({...options,provider:{async generate(){throw new Error("must not call provider");}}});restored.restore(saved);assert.deepEqual(restored.active(),first.active());assert.equal(await restored.acknowledge(saved.scenes[0]!.id,saved.scenes[0]!.receipt),true);
});
test("demo mode shortens voting without weakening guard or builder deadlines",()=>{assert.deepEqual(DEMO_MS,{ideas:20000,voting:10000,guarding:45000,building:180000,rollback:10000});assert.equal(DEMO_MS.guarding,ROUND_MS.guarding);assert.equal(DEMO_MS.building,ROUND_MS.building);});

test("crash recovery discards an unpromoted worktree and forward-restores an unacknowledged ship",async()=>{
 const {mkdir}=await import("node:fs/promises"),{git,createTree,commitTree,promote}=await import("../server/runner/git.js"),{Versions}=await import("../server/versions/index.js"),{Runner}=await import("../server/runner/index.js");
 const root=await mkdtemp(join(tmpdir(),"recovery-"));try{
  await mkdir(join(root,"world/modules"),{recursive:true});await writeFile(join(root,".gitignore"),"state/\nworktrees/\n");await writeFile(join(root,"world/modules/visual.ts"),"export default 1;\n");await git(root,"init","-b","master");await git(root,"add",".");await git(root,"-c","user.name=Test","-c","user.email=test@localhost","commit","--no-gpg-sign","-m","Base");
  const base=await git(root,"rev-parse","HEAD"),versions=new Versions(root,()=>{});await versions.baselineAt(base);const runner=new Runner({root,versions,feed(){},announce:async()=>{}});
  let tree=await createTree(root,1,base);await versions.setPending({path:tree,base,version:1});await writeFile(join(tree,"world/modules/visual.ts"),"partial edit\n");await runner.recover();assert.equal(versions.pending,undefined);assert.equal(await git(root,"rev-parse","HEAD"),base);assert.equal((await git(root,"worktree","list","--porcelain")).split("worktree ").length-1,1);
  tree=await createTree(root,1,base);await versions.setPending({path:tree,base,version:1});await writeFile(join(tree,"world/modules/visual.ts"),"export default 2;\n");const candidate=await commitTree(tree,"v1 interrupted activation");await promote(root,base,candidate,"v1");await runner.recover();assert.equal(await git(root,"rev-parse","v1"),candidate);assert.equal(await readFile(join(root,"world/modules/visual.ts"),"utf8"),"export default 1;\n");assert.equal(versions.current?.restoredFrom,"v0");assert.equal(versions.current?.tag,"v2");assert.equal(versions.pending,undefined);assert.equal(await git(root,"status","--porcelain"),"");assert.equal((await git(root,"worktree","list","--porcelain")).split("worktree ").length-1,1);versions.close();await runner.close();
 }finally{await rm(root,{recursive:true,force:true});}
});

test("recovery never restores over a master advanced outside the reserved version tag",async()=>{
 const {mkdir}=await import("node:fs/promises"),{git,createTree}=await import("../server/runner/git.js"),{Versions}=await import("../server/versions/index.js"),{Runner}=await import("../server/runner/index.js"),root=await mkdtemp(join(tmpdir(),"recovery-user-"));
 try{await mkdir(join(root,"world/modules"),{recursive:true});await writeFile(join(root,".gitignore"),"state/\nworktrees/\n");await writeFile(join(root,"world/modules/visual.ts"),"export default 1;\n");await git(root,"init","-b","master");await git(root,"add",".");await git(root,"-c","user.name=Test","-c","user.email=test@localhost","commit","--no-gpg-sign","-m","Base");const base=await git(root,"rev-parse","HEAD"),tree=await createTree(root,1,base),versions=new Versions(root,()=>{});await versions.baselineAt(base);await versions.setPending({path:tree,base,version:1});await writeFile(join(root,"world/modules/visual.ts"),"export default 99;\n");await git(root,"add",".");await git(root,"-c","user.name=Test","-c","user.email=test@localhost","commit","--no-gpg-sign","-m","User work");const head=await git(root,"rev-parse","HEAD"),runner=new Runner({root,versions,feed(){},announce:async()=>{}});await assert.rejects(runner.recover(),/outside the interrupted run/);assert.equal(await git(root,"rev-parse","HEAD"),head);assert.equal(await readFile(join(root,"world/modules/visual.ts"),"utf8"),"export default 99;\n");assert.ok(versions.pending);await runner.close();versions.close();}finally{await rm(root,{recursive:true,force:true});}
});

test("idle flushes do no I/O and checkpoint bursts use a trailing debounce",async()=>{
 const root=await mkdtemp(join(tmpdir(),"idle-checkpoint-"));let captures=0;const checkpoint=new Checkpoint(join(root,"world.json"),()=>++captures,()=>{},40);
 try{await checkpoint.flush();assert.equal(captures,0);checkpoint.changed();await new Promise(r=>setTimeout(r,25));checkpoint.changed();await new Promise(r=>setTimeout(r,25));assert.equal(captures,0);await checkpoint.flush();assert.equal(captures,1);await checkpoint.flush();assert.equal(captures,1);assert.ok(checkpoint.savedAt>0);}finally{await checkpoint.flush();await rm(root,{recursive:true,force:true});}
});
test("saved source state rebuilds round indexes and advances unpaused elapsed time",()=>{
 let now=1000;const original=new Rounds({now:()=>now,publish(){}});original.command(chat("maker","!idea A lantern"));original.skip();const saved=original.checkpoint();assert.ok(!("state" in saved));assert.ok(!("normalized" in saved.ideas[0]!));now+=5000;const restored=new Rounds({now:()=>now,publish(){}});restored.restore(saved,1000);assert.equal(restored.snapshot().endsAt-restored.snapshot().now,ROUND_MS.voting-5000);assert.equal(restored.snapshot().candidates[0]!.supporters,1);original.dispose();restored.dispose();
});
test("world checkpoints retain recent dedup ids and omit transient chat cooldowns",()=>{
 let now=1000;const original=new WorldPipeline(()=>now);original.chat(chat("old","hello"));now+=60001;original.chat(chat("recent","hello"));const saved=original.checkpoint();assert.deepEqual(saved.seen.map(([id])=>id),["chat:recent"]);assert.ok(!("cooldowns" in saved));const restored=new WorldPipeline(()=>now);restored.restore(saved);assert.equal(restored.chat(chat("recent","hello")).reason,"duplicate");
});

test("HTTP POST flushes once and world polling never calls durable",async()=>{
 const {createWorldServer}=await import("../server/http.js");let flushes=0;const app=await createWorldServer(new WorldPipeline(),undefined,undefined,undefined,{simulationAllowed:true,live:false,durable:async()=>{flushes++;},async fault(){}});await new Promise<void>(r=>app.server.listen(0,"127.0.0.1",r));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
 try{const response=await fetch(base+"/sim/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(chat("writer","hello"))});assert.equal(response.status,200);assert.equal(flushes,0);for(let i=0;i<10;i++)assert.equal((await fetch(base+"/api/world")).status,200);assert.equal(flushes,0);}finally{app.closeStreams();await new Promise<void>(r=>app.server.close(()=>r()));}
});

test("Phase 9 round checkpoints migrate at the load boundary",async()=>{
 const original=new Rounds({now:()=>1000,publish(){}});original.command(chat("maker","!idea A lantern"));original.skip();original.command(chat("voter","!vote 1"));const source=original.checkpoint(),legacy={state:original.snapshot(),ideas:source.ideas.map(idea=>({...idea,normalized:"stale-derived-index"})),votes:source.votes,shortlist:source.shortlist,winner:source.winner,order:source.order,serial:source.serial,version:source.version,rollbackVotes:source.rollbackVotes};const restored=new Rounds({now:()=>1000,publish(){}});const {migrateWorldCheckpoint}=await import("../server/persistence/world-schema.js");const migrated=migrateWorldCheckpoint({format:1,savedAt:1000,value:{world:{cooldowns:[]},rounds:legacy}}) as {value:{rounds:ReturnType<Rounds["checkpoint"]>}};restored.restore(migrated.value.rounds,1000);assert.equal(restored.snapshot().totalVotes,1);assert.equal(restored.snapshot().candidates[0]!.supporters,1);assert.ok(!("state" in restored.checkpoint()));assert.ok(!("normalized" in restored.checkpoint().ideas[0]!));original.dispose();restored.dispose();
});

test("recovery removes a reserved tag that never reached master",async()=>{
 const {mkdir}=await import("node:fs/promises"),{git,createTree,commitTree}=await import("../server/runner/git.js"),{Versions}=await import("../server/versions/index.js"),{Runner}=await import("../server/runner/index.js");const root=await mkdtemp(join(tmpdir(),"unshipped-"));
 try{await mkdir(join(root,"world/modules"),{recursive:true});await writeFile(join(root,".gitignore"),"state/\nworktrees/\n");await writeFile(join(root,"world/modules/a.ts"),"export default 1;");await git(root,"init","-b","master");await git(root,"add",".");await git(root,"-c","user.name=Test","-c","user.email=test@localhost","commit","--no-gpg-sign","-m","Base");const base=await git(root,"rev-parse","HEAD"),versions=new Versions(root,()=>{}),tree=await createTree(root,1,base);await writeFile(join(tree,"world/modules/a.ts"),"export default 2;");const commit=await commitTree(tree,"Checked candidate");await versions.setPending({path:tree,base,version:1});await git(root,"tag","v1",commit);const runner=new Runner({root,versions,feed(){},announce:async()=>{}});await runner.recover();assert.equal(await git(root,"tag","--list"),"");assert.equal(await git(root,"rev-parse","HEAD"),base);assert.equal(versions.pending,undefined);await runner.close();versions.close();}finally{await rm(root,{recursive:true,force:true});}
});

test("steady changes hit max wait and flush stops at its captured generation",async()=>{
 const root=await mkdtemp(join(tmpdir(),"bounded-save-"));let captured=0,first!:()=>void;const written=new Promise<void>(r=>first=r),checkpoint=new Checkpoint(join(root,"world.json"),()=>{captured++;first();return captured;},()=>{},100,70);const timer=setInterval(()=>checkpoint.changed(),10);
 try{checkpoint.changed();await Promise.race([written,new Promise((_,reject)=>setTimeout(()=>reject(new Error("Max wait was starved")),1000))]);clearInterval(timer);await checkpoint.flush();assert.ok(captured>0);
 let snapshots=0;const generations=new Checkpoint(join(root,"generation.json"),()=>{snapshots++;if(snapshots===1)generations.changed();return snapshots;});generations.changed();await generations.flush();assert.equal(snapshots,1);await generations.flush();assert.equal(snapshots,2);
 }finally{clearInterval(timer);await checkpoint.flush();await rm(root,{recursive:true,force:true});}
});
test("version activation acknowledgement has exactly one final manifest save",async()=>{
 const {Versions}=await import("../server/versions/index.js"),root=await mkdtemp(join(tmpdir(),"receipt-save-"));let saves=0,published!:()=>void;const ready=new Promise<void>(r=>published=r);
 class Observed extends Versions{override async save(){saves++;await super.save();}}
 const versions=new Observed(root,()=>published());try{const activation=versions.activate({version:1,tag:"v1",commit:"fixture",title:"Fixture",requester:"viewer",modules:[]});await ready;assert.equal(saves,1);assert.equal(await versions.acknowledge(1,versions.current!.receipt,true),true);assert.equal(await activation,true);assert.equal(saves,2);assert.equal(JSON.parse(await readFile(join(root,"state/versions.json"),"utf8")).current.healthy,true);}finally{versions.close();await rm(root,{recursive:true,force:true});}
});

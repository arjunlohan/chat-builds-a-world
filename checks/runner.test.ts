import { Runner } from "../server/runner/index.js";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, rename, readdir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { git, inventory, auditDiff, cleanMaster, createTree, removeTree, commitTree, promote, validateTree } from "../server/runner/git.js";
import { inspectModule } from "../server/runner/policy.js";
import { readableEvent } from "../server/runner/events.js";
import { runnerPrompt, runCodex } from "../server/runner/codex.js";
import { Versions } from "../server/versions/index.js";
import { Rounds } from "../server/rounds/index.js";
import {THREE_IMPORTS,threeImportRule} from "../server/runner/imports.js";
import {buildGuardPrompt} from "../server/guard/index.js";
import {candidateRejected,infrastructureFailed} from "../server/runner/verdict.js";
import type {CheckResult} from "../server/runner/check.js";
import {ACTIVE_MODULE_CAP} from "../world/shared/limits.js";
test("the checked import manifest drives policy, both prompts and the engineering contract",async()=>{
 const rule=threeImportRule(),contract=await readFile("AGENTS.md","utf8");assert.ok(contract.includes(rule));assert.ok(buildGuardPrompt("a small firefly cloud").includes(rule));
 for(const name of THREE_IMPORTS)assert.doesNotThrow(()=>inspectModule(`import {${name}} from "three";`,"world/modules/test.ts"));
 assert.throws(()=>inspectModule('import Three, {Mesh} from "three";',"world/modules/test.ts"),/Only vetted/);
 const source=(await readFile("checks/fixtures/modules/particles.ts","utf8")).replace("../../../world/engine/api.js","../engine/api.js");assert.doesNotThrow(()=>inspectModule(source,"world/modules/test.ts"));
 assert.throws(()=>inspectModule(source.replace("Points, PointsMaterial","WebGLRenderer, Points, PointsMaterial"),"world/modules/test.ts"),/Only vetted/);
});
async function knownVersions(root:string,publish:ConstructorParameters<typeof Versions>[1]){const v=new Versions(root,publish);await v.reportBaseUsage({nodes:0,triangles:0,draws:0,lights:0,particles:0});return v;}
async function repository() {
  const root = await mkdtemp(join(tmpdir(), "runner-unit-")); await mkdir(join(root, "world/modules"), { recursive: true });
  await writeFile(join(root, "README.md"), "session file\n"); await writeFile(join(root, ".gitignore"), "state/\nworktrees/\n.env\n.codex-runtime/\n");
  await writeFile(join(root,"AGENTS.md"),"## World Module API v1\nDefault fixture contract.\n## Scene Spec v1\n");
  await writeFile(join(root, "world/modules/a.ts"), "export default () => ({});\n");
  await git(root, "init", "-b", "master"); await git(root, "add", "."); await git(root, "-c", "user.name=Test", "-c", "user.email=test@localhost", "commit", "--no-gpg-sign", "-m", "Base"); return root;
}
test('the real fake builder rewrites kit fixture API paths independent of quote style',async()=>{
 const root=await repository();try{for(const kind of ['orchard','race-track']){
  const decision={verdict:'accept' as const,title:'Kit visual',reason:'Safe fixture',spec:{moduleId:kind,description:kind,steps:['Create visual'],checks:['Dispose'],estimatedSeconds:60},files:[`world/modules/${kind}.ts`],mode:'fixture' as const,latencyMs:0};
  await runCodex({root,tree:root,bin:resolve('checks/fixtures/fake-builder.cjs'),env:{PATH:process.env.PATH!,HOME:process.env.HOME!,AWS_BEARER_TOKEN_BEDROCK:'offline-fixture'},decision,signal:new AbortController().signal,feed(){}});
  const source=await readFile(join(root,decision.files[0]!), 'utf8');assert.ok(!source.includes('../../../world/engine/api.js'));assert.doesNotThrow(()=>inspectModule(source,decision.files[0]!));
 }}finally{await rm(root,{recursive:true,force:true});}
});
test("temporary worktrees are unique, repository-owned, symlink-safe and fully cleaned",async()=>{
 const root=await repository(),other=await repository();let tree="",second="";try{
  const base=await cleanMaster(root);tree=await createTree(root,1,base);second=await createTree(root,1,base);assert.notEqual(tree,second);assert.equal(dirname(dirname(tree)),await realpath(tmpdir()));assert.ok(!tree.startsWith(root+"/"));assert.equal(await validateTree(root,tree,1),true);
  await assert.rejects(validateTree(root,tree,2),/Invalid/);await assert.rejects(validateTree(other,tree,1),/Invalid/);await assert.rejects(removeTree(root,root),/Invalid/);
  const original=tree,alias=join(dirname(tree),"alias");await symlink(tree,alias);await assert.rejects(validateTree(root,alias,1),/Invalid/);await rm(alias);
  await rename(tree,tree+"-real");await symlink(tree+"-real",tree);await assert.rejects(validateTree(root,tree,1),/symlink/);await rm(tree);await rename(tree+"-real",tree);
  const parent=dirname(tree);await removeTree(root,tree);tree="";await assert.rejects(realpath(parent));assert.equal(await git(root,"status","--porcelain"),"");assert.equal(await git(root,"rev-parse","HEAD"),base);
 }finally{if(tree)await removeTree(root,tree);if(second)await removeTree(root,second);await rm(root,{recursive:true,force:true});await rm(other,{recursive:true,force:true});}
});
test("diff audit includes ignored/untracked files and rejects deletions, renames and symlinks", async () => {
 const root = await repository();
 try {
  const base = await cleanMaster(root), before = await inventory(root), allowed = ["world/modules/a.ts","world/modules/new.ts"];
  await writeFile(join(root,"world/modules/new.ts"),"export default () => ({});");assert.deepEqual(await auditDiff(root,base,before,allowed),["world/modules/new.ts"]);
  await writeFile(join(root,".env"),"not a credential"); await assert.rejects(()=>auditDiff(root,base,before,allowed),/outside approved/); await rm(join(root,".env"));
  await rm(join(root,"world/modules/new.ts"));await rename(join(root,"world/modules/a.ts"),join(root,"world/modules/new.ts")); await assert.rejects(()=>auditDiff(root,base,before,allowed));
  await rename(join(root,"world/modules/new.ts"),join(root,"world/modules/a.ts"));await symlink(join(root,"README.md"),join(root,"world/modules/new.ts"));await assert.rejects(()=>auditDiff(root,base,before,allowed),/Symlinks/);
 } finally {await rm(root,{recursive:true,force:true})}
});
test("inventory accepts the real committed asset tree, while writes keep the 2 MiB limit",async()=>{
 const root=process.cwd(),base=await git(root,"rev-parse","HEAD");let tree="";
 try{tree=await createTree(root,999999,base);const before=await inventory(tree);
  assert.ok(before.has("assets/world/sky.hdr"));
  await writeFile(join(tree,"world/modules/oversized.ts"),Buffer.alloc(2_097_153));
  await assert.rejects(auditDiff(tree,base,before,["world/modules/oversized.ts"]),/exceeds 2 MiB/);
  await rm(join(tree,"world/modules/oversized.ts"));
  await writeFile(join(tree,"assets/world/sky.hdr"),Buffer.alloc(2_097_153));
  await assert.rejects(auditDiff(tree,base,before,[]),/exceeds 2 MiB/);
 }finally{if(tree)await removeTree(root,tree);}
});
test("dirty session state and an advanced master block promotion without checkout, stash or reset",async()=>{
 const root=await repository();let tree="";
 try {
  const base=await cleanMaster(root);tree=await createTree(root,1,base);await writeFile(join(tree,"world/modules/a.ts"),"export default () => ({ id: 'new' });");const commit=await commitTree(tree,"v1: candidate (requested by @viewer)");
  await writeFile(join(root,"README.md"),"user's uncommitted work");await git(root,"add","README.md");const index=await git(root,"diff","--cached");
  await assert.rejects(()=>promote(root,base,commit,"v1"),/dirty/);assert.equal(await readFile(join(root,"README.md"),"utf8"),"user's uncommitted work");assert.equal(await git(root,"diff","--cached"),index);
  await git(root,"-c","user.name=Test","-c","user.email=test@localhost","commit","--no-gpg-sign","-m","User advanced master");const userHead=await git(root,"rev-parse","HEAD");
  await assert.rejects(()=>promote(root,base,commit,"v1"),/advanced/);assert.equal(await git(root,"rev-parse","HEAD"),userHead);
 }finally{if(tree)await removeTree(root,tree);await rm(root,{recursive:true,force:true})}
});
test("static module policy rejects ambient authority, executable hooks and top-level effects",()=>{
 const good='import type { WorldModule } from "../engine/api.js"; export default (): WorldModule => ({id:"test",init(){},update(){},onChat(){},onCitizenSpawn(){},onRaid(){},dispose(){}});';
 assert.doesNotThrow(()=>inspectModule(good,"world/modules/test.ts"));
 for(const bad of ['fetch("https://example.com")','window.x = 1','new Function("return 1")','const x = new Map();','import { WebGLRenderer } from "three";','const x = async () => {};','const x = () => Promise.resolve();','const x = () => mesh.addEventListener("x", () => {});','const x = () => ({update(){new BoxGeometry();}})','const x = (a: any) => a;','const x = () => foo.onBeforeRender;','const x = () => foo["constructor"];'])assert.throws(()=>inspectModule(bad,"world/modules/test.ts"),bad);
});
test("feed translates events into readable plans, approved file names and generic checks",()=>{
 assert.equal(readableEvent({type:"turn.started"})?.kind,"plan");
 assert.match(readableEvent({type:"item.updated",item:{type:"todo_list",items:[{text:"Add the module",completed:false}]}})!.text,/Next: Add the module/);
 assert.match(readableEvent({type:"item.completed",item:{type:"file_change",changes:[{path:"world/modules/test.ts"}]}})!.text,/Edited world\/modules/);
 assert.ok(!readableEvent({type:"item.completed",item:{type:"command_execution",command:"private upstream command",exit_code:0}})!.text.includes("private upstream"));
 assert.equal(readableEvent({type:"reasoning",text:"private"}),null);
});
test("runner prompt carries locked API and quoted guard data; fake CLI cancellation scrubs its environment",async()=>{
 const decision={verdict:"accept" as const,title:"Test",reason:"Safe",spec:{moduleId:"test",description:"timeout",steps:["Small visual"],checks:["Cleanup"],estimatedSeconds:60},files:["world/modules/test.ts"]};
 const root=process.cwd(), prompt=await runnerPrompt(root,decision);assert.ok(prompt.includes("2 ms total per frame"));assert.ok(prompt.includes(threeImportRule()));assert.ok(prompt.includes("Write the implementation to world/modules/test.ts before replying"));assert.ok(prompt.endsWith(JSON.stringify({title:decision.title,spec:decision.spec,files:decision.files})));
 const controller=new AbortController();const pending=runCodex({root,tree:root,bin:resolve("checks/fixtures/fake-builder.cjs"),env:{PATH:process.env.PATH!,HOME:process.env.HOME!,AWS_BEARER_TOKEN_BEDROCK:"synthetic-not-a-key",TWITCH_ACCESS_TOKEN:"forbidden"},decision,signal:controller.signal,feed(){}});
 setTimeout(()=>controller.abort(),100);await assert.rejects(()=>pending,/cancelled/);
});
test("version recovery checks artifact hashes and receipt identity",async()=>{
 const root=await mkdtemp(join(tmpdir(),"versions-unit-"));
 try { const store=new Versions(root,()=>{});const module=await store.artifact("test","world/modules/test.ts","export default () => ({});");
  await store.activate({version:1,tag:"v1",commit:"base",title:"Test",requester:"viewer",modules:[module]},false);
  assert.equal(await store.acknowledge(1,"wrong",true),false);assert.equal(await store.acknowledge(1,store.current!.receipt,true),true);
  const restored=new Versions(root,()=>{});await restored.init();assert.equal(restored.current!.tag,"v1");
  await writeFile(join(root,"state/modules",`${module.hash}.js`),"tampered");await assert.rejects(()=>new Versions(root,()=>{}).init(),/hash mismatch/);
 }finally{await rm(root,{recursive:true,force:true})}
});
test("rollback vote lasts 30 seconds, replaces ballots and rejects ties without a restore",async()=>{
 let now=0,calls=0;const rounds=new Rounds({now:()=>now,publish(){},canRollback:()=>true,rollback:async()=>{calls++;return{ok:true,outcome:"ROLLED BACK",reason:"Restored v1",durationMs:1,tokens:{input:0,output:0,total:0},version:3}}});
 const send=(id:string,text:string)=>rounds.command({id,userId:id,displayName:id,color:"#ABCDEF",text,timestamp:now});
 send("requester","!rollback");assert.equal(rounds.snapshot().endsAt,30_000);send("a","!vote yes");send("b","!vote no");now=29_999;rounds.tick();assert.equal(calls,0);now++;rounds.tick();assert.equal(calls,0);assert.equal(rounds.snapshot().phase,"ideas");
 send("again","!rollback");send("a","!vote no");send("a","!vote yes");now+=30_000;rounds.tick();await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.equal(rounds.snapshot().build.status,"shipped");
});

test("runner:live without a key stops before browser/provider/Git activity",async()=>{
 const cwd=await mkdtemp(join(tmpdir(),"runner-no-key-"));
 try {const result=spawnSync(process.execPath,["--import",createRequire(import.meta.url).resolve("tsx"),resolve("server/runner/live.ts")],{cwd,env:{PATH:process.env.PATH!,HOME:process.env.HOME!},encoding:"utf8",timeout:5000});assert.equal(result.status,1);assert.match(result.stderr,/No request or Git operation was started/);}
 finally{await rm(cwd,{recursive:true,force:true})}
});

test("protected data written only into module source is rejected before compilation or broadcast",async()=>{
 const root=await repository(), secret="synthetic-fixture-secret";const feed:string[]=[];
 try {
  await writeFile(join(root,"AGENTS.md"),"## World Module API v1\nSynchronous hooks only.\n## Scene Spec v1\n");await git(root,"add","AGENTS.md");await git(root,"-c","user.name=Test","-c","user.email=test@localhost","commit","--no-gpg-sign","-m","Contract");
  const head=await git(root,"rev-parse","HEAD"),versions=await knownVersions(root,()=>{});
  const runner=new Runner({root,versions,env:{PATH:process.env.PATH!,HOME:process.env.HOME!,AWS_BEARER_TOKEN_BEDROCK:secret},bin:resolve("checks/fixtures/fake-builder.cjs"),feed:(_kind,text)=>feed.push(text),announce:async()=>{}});
  const result=await runner.build({requester:"viewer",signal:new AbortController().signal,decision:{verdict:"accept",title:"Test",reason:"Fixture",spec:{moduleId:"security",description:"protected",steps:["Small visual"],checks:["Cleanup"],estimatedSeconds:60},files:["world/modules/security.ts"],mode:"live",latencyMs:0}});
  assert.equal(result.ok,false);assert.match(result.reason,/protected data/);assert.ok(!JSON.stringify({result,feed}).includes(secret));assert.equal(await git(root,"rev-parse","HEAD"),head);
 }finally{await rm(root,{recursive:true,force:true})}
});

test("a completed builder with no edits reports its explanation and retains only redacted public evidence",async()=>{
 const root=await repository(),secret="synthetic-nochange-secret";try{
  await writeFile(join(root,"AGENTS.md"),"## World Module API v1\nSynchronous hooks only.\n## Scene Spec v1\n");await git(root,"add","AGENTS.md");await git(root,"-c","user.name=Test","-c","user.email=test@localhost","commit","--no-gpg-sign","-m","Contract");
  const versions=await knownVersions(root,()=>{}),head=await git(root,"rev-parse","HEAD");
  const runner=new Runner({root,versions,env:{PATH:process.env.PATH!,HOME:process.env.HOME!,AWS_BEARER_TOKEN_BEDROCK:secret},bin:resolve("checks/fixtures/fake-builder.cjs"),feed(){},announce:async()=>{}});
  const result=await runner.build({requester:"viewer",signal:new AbortController().signal,decision:{verdict:"accept",title:"Rain",reason:"Safe",spec:{moduleId:"rain",description:"nochange",steps:["Implement rain"],checks:["Dispose"],estimatedSeconds:60},files:["world/modules/rain.ts"],mode:"fixture",latencyMs:0}});
  assert.equal(result.outcome,"REVERTED");assert.match(result.reason,/no module changes.*could not implement.*available API/);assert.ok(!result.reason.includes(secret));assert.deepEqual(result.tokens,{input:123,output:45,total:168});
  const files=await readdir(join(root,"state/builds"));assert.equal(files.length,1);const text=await readFile(join(root,"state/builds",files[0]!),"utf8"),saved=JSON.parse(text);assert.equal(saved.completed,true);assert.equal(saved.failedCommands,1);assert.match(saved.summary,/REDACTED/);assert.ok(!text.includes(secret));assert.ok(!text.includes("private tool invocation"));assert.equal(await git(root,"rev-parse","HEAD"),head);assert.equal((await git(root,"worktree","list","--porcelain")).split("worktree ").length-1,1);await runner.close();versions.close();
 }finally{await rm(root,{recursive:true,force:true});}
});

test("failed live acknowledgement restores module content with a forward commit and cleans the tree",async()=>{
 const root=await repository();
 try {
  await mkdir(join(root,"world/engine"));await writeFile(join(root,"world/engine/api.ts"),'import type {Group} from "three"; export interface WorldModule {id:string;init(s:{scene:Group}):void;update(dt:number):void;onChat():void;onCitizenSpawn():void;onRaid():void;dispose():void;}');
  await writeFile(join(root,"AGENTS.md"),"## World Module API v1\nSynchronous hooks only.\n## Scene Spec v1\n");await git(root,"add",".");await git(root,"-c","user.name=Test","-c","user.email=test@localhost","commit","--no-gpg-sign","-m","Contract");
  const baseline=await git(root,"rev-parse","HEAD");let versions!:Versions;
  versions=await knownVersions(root,version=>{if(version)versions.acknowledge(version.version,version.receipt,false)});
  const runner=new Runner({root,versions,bin:resolve("checks/fixtures/fake-builder.cjs"),env:{PATH:process.env.PATH!,HOME:process.env.HOME!,AWS_BEARER_TOKEN_BEDROCK:"synthetic-fixture-secret"},feed(){},announce:async()=>{},check:async()=>({ok:true,fps:60,avgFps:60})});
  const result=await runner.build({requester:"viewer",signal:new AbortController().signal,decision:{verdict:"accept",title:"Test",reason:"Fixture",spec:{moduleId:"activation",description:"good",steps:["Small visual"],checks:["Cleanup"],estimatedSeconds:60},files:["world/modules/activation.ts"],mode:"fixture",latencyMs:0}});
  assert.equal(result.ok,false);assert.match(result.reason,/activation/);assert.equal(versions.current!.modules.length,0);assert.equal(versions.previous(),null,"A failed activation must never become a rollback target");
  assert.equal(await git(root,"diff",baseline,"HEAD","--","world/modules"),"");assert.equal(await git(root,"rev-list","--count",`${baseline}..HEAD`),"2");
  assert.equal(await git(root,"status","--porcelain","--untracked-files=all"),"");assert.equal((await git(root,"worktree","list","--porcelain")).split("worktree ").length-1,1);versions.close();
 }finally{await rm(root,{recursive:true,force:true})}
});
test("preemption awaits aborted operation cleanup before rollback", async () => {
  const { OperationQueue } = await import("../server/runtime/queue.js");
  const queue = new OperationQueue(), events: string[] = [];
  const build = queue.enqueue(async signal => { events.push("build"); await new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), {once:true})); await new Promise(r => setTimeout(r,20)); events.push("cleaned"); });
  const rollback = queue.enqueue(async () => { events.push("rollback"); }, true);
  await Promise.all([build,rollback]); assert.deepEqual(events,["build","cleaned","rollback"]);
});
test("a metrics write failure cannot revert a successfully activated version", async () => {
 const root=await repository();
 try{
  await mkdir(join(root,"world/engine"));await writeFile(join(root,"world/engine/api.ts"),'import type {Group} from "three"; export interface WorldModule {id:string;init(s:{scene:Group}):void;update(dt:number):void;onChat():void;onCitizenSpawn():void;onRaid():void;dispose():void;}');
  await writeFile(join(root,"AGENTS.md"),"## World Module API v1\nSynchronous hooks only.\n## Scene Spec v1\n");await git(root,"add",".");await git(root,"-c","user.name=Test","-c","user.email=test@localhost","commit","--no-gpg-sign","-m","Contract");
  let versions!:Versions;versions=await knownVersions(root,v=>{if(v)versions.acknowledge(v.version,v.receipt,true)});
  const runner=new Runner({root,versions,bin:resolve("checks/fixtures/fake-builder.cjs"),env:{PATH:process.env.PATH!,HOME:process.env.HOME!,AWS_BEARER_TOKEN_BEDROCK:"synthetic-fixture-secret"},feed(){},announce:async()=>{},record(){throw new Error("disk full")},check:async()=>({ok:true,fps:60,avgFps:60})});
  const result=await runner.build({requester:"viewer",signal:new AbortController().signal,decision:{verdict:"accept",title:"Test",reason:"Safe",spec:{moduleId:"metric",description:"good",steps:["Small visual"],checks:["Cleanup"],estimatedSeconds:60},files:["world/modules/metric.ts"],mode:"live",latencyMs:0}});
  assert.equal(result.outcome,"SHIPPED");assert.equal(versions.current?.tag,"v1");assert.equal(await git(root,"tag","--list"),"v1");versions.close();
 }finally{await rm(root,{recursive:true,force:true})}
});
test("runtime configuration writes cannot dirty the canonical tracked Codex home", async () => {
 const {withCodexHome}=await import("../server/runtime/process.js"),root=await repository();
 try{
  await mkdir(join(root,".codex-runtime"),{recursive:true});const canonical=join(root,".codex-runtime/config.toml");await writeFile(canonical,'model = "test"\n');
  let isolated="";await withCodexHome(root,{PATH:process.env.PATH,HOME:process.env.HOME,AWS_BEARER_TOKEN_BEDROCK:"synthetic-credential",TWITCH_ACCESS_TOKEN:"must-not-inherit"},async env=>{
   isolated=env.CODEX_HOME!;assert.notEqual(isolated,join(root,".codex-runtime"));assert.equal(env.TWITCH_ACCESS_TOKEN,undefined);assert.equal(await readFile(join(isolated,"config.toml"),"utf8"),'model = "test"\n');await writeFile(join(isolated,"config.toml"),'runtime preference = true');
  });assert.equal(await readFile(canonical,"utf8"),'model = "test"\n');await assert.rejects(readFile(join(isolated,"config.toml")));assert.equal(await git(root,"status","--porcelain"),"");
 }finally{await rm(root,{recursive:true,force:true})}
});
test("automatic rollback preempts a real queued build and waits for its worktree cleanup", async () => {
 const root=await repository(),events:string[]=[];
 try{
  const first=await git(root,"rev-parse","HEAD"),firstSource=await readFile(join(root,"world/modules/a.ts"),"utf8");let versions!:Versions;
  versions=await knownVersions(root,v=>{if(v)versions.acknowledge(v.version,v.receipt,true)});await versions.baselineAt(first);
  const bundle='export default () => ({id:"visual",init(){},update(){},onChat(){},onCitizenSpawn(){},onRaid(){},dispose(){}});';
  const one=await versions.artifact("visual","world/modules/a.ts",bundle);await versions.activate({version:1,tag:"v1",commit:first,title:"One",requester:"viewer",modules:[one]},false);
  await writeFile(join(root,"world/modules/a.ts"),"export default () => ({id:'failed'});\n");const second=await commitTree(root,"v2 fixture");const two=await versions.artifact("visual","world/modules/a.ts",bundle+'\n// second version');
  await versions.activate({version:2,tag:"v2",commit:second,title:"Two",requester:"viewer",modules:[two]},false);await versions.invalidate(2);
  let started!:()=>void;const ready=new Promise<void>(r=>started=r);
  const runner=new Runner({root,versions,feed(){},announce:async()=>{events.push("restored")},record(){},builder:async({signal})=>{started();await new Promise<void>(r=>signal.addEventListener("abort",()=>r(),{once:true}));await new Promise(r=>setTimeout(r,20));events.push("child-cleaned");throw new Error("cancelled");}});
  const build=runner.build({requester:"viewer",signal:new AbortController().signal,decision:{verdict:"accept",title:"New",reason:"Safe",spec:{moduleId:"new",description:"Small visual",steps:["Create"],checks:["Dispose"],estimatedSeconds:60},files:["world/modules/new.ts"],mode:"live",latencyMs:0}});
  await ready;const restore=runner.rollback("system",true);assert.equal((await build).ok,false);assert.equal((await restore).outcome,"ROLLED BACK");assert.deepEqual(events,["child-cleaned","restored"]);
  assert.equal(await readFile(join(root,"world/modules/a.ts"),"utf8"),firstSource);assert.equal((await git(root,"worktree","list","--porcelain")).split("worktree ").length-1,1);assert.equal(await git(root,"status","--porcelain"),"");versions.close();
 }finally{await rm(root,{recursive:true,force:true})}
});

test("verified EventSub moderator veto drains a running CLI and its worktree",async()=>{
 const {EventEmitter}=await import("node:events"),{WorldPipeline}=await import("../server/pipeline.js"),{TwitchClient}=await import("../server/twitch/index.js");const root=await repository();
 class Socket extends EventEmitter{close(){this.emit("close");}terminate(){}message(type:string,payload:object,id:string){this.emit("message",Buffer.from(JSON.stringify({metadata:{message_type:type,message_id:id},payload})));}}
 let rounds:Rounds|undefined,client:InstanceType<typeof TwitchClient>|undefined,child=0;try{
  await writeFile(join(root,"AGENTS.md"),"## World Module API v1\nSynchronous hooks only.\n## Scene Spec v1\n");await git(root,"add","AGENTS.md");await git(root,"-c","user.name=Test","-c","user.email=test@localhost","commit","--no-gpg-sign","-m","Contract");
  const versions=await knownVersions(root,()=>{}),pipeline=new WorldPipeline();let spawned!:()=>void;const ready=new Promise<void>(r=>spawned=r);let result!:ReturnType<Runner["build"]>;
  const runner=new Runner({root,versions,bin:resolve("checks/fixtures/fake-builder.cjs"),env:{PATH:process.env.PATH!,HOME:process.env.HOME!,AWS_BEARER_TOKEN_BEDROCK:"offline-fixture"},feed(){},announce:async()=>{},builder:options=>runCodex({...options,onSpawn:async pid=>{await options.onSpawn?.(pid);child=pid;spawned();}})});
  rounds=new Rounds({publish(){},review:()=>({verdict:"accept",reason:"Safe fixture",title:"Lantern",spec:{moduleId:"lantern",description:"timeout",steps:["Create a small lantern"],checks:["Dispose"],estimatedSeconds:60},files:["world/modules/lantern.ts"],mode:"fixture",latencyMs:0}),build:request=>result=runner.build(request)});pipeline.attachRounds(rounds);
  rounds.command({id:"idea",userId:"viewer",displayName:"Viewer",color:"#79D7CF",text:"!idea A small lantern",timestamp:Date.now()});rounds.skip();rounds.skip();await ready;assert.equal(rounds.snapshot().phase,"building");
  const socket=new Socket(),admitted:boolean[]=[];client=new TwitchClient({clientId:"test",clientSecret:"synthetic",accessToken:"synthetic",refreshToken:"synthetic",broadcasterId:"42"},{onChat:(event,authority)=>{admitted.push(pipeline.chat(event,authority).accepted);},onRaid(){}},{socket:()=>socket as unknown as import("ws").default,fetch:async url=>new Response(JSON.stringify(String(url).endsWith("validate")?{client_id:"test",user_id:"42",scopes:["user:read:chat","user:write:chat"]}:{}),{status:String(url).endsWith("validate")?200:202}),store:{load:async()=>undefined,save:async()=>{}},log(){}});await client.start();socket.message("session_welcome",{session:{id:"session",keepalive_timeout_seconds:10}},"welcome");await new Promise(r=>setImmediate(r));
  const veto=(user:string,badges:object[])=>socket.message("notification",{subscription:{type:"channel.chat.message"},event:{broadcaster_user_id:"42",chatter_user_id:user,chatter_user_name:user,message_id:user,color:"#79D7CF",message:{text:"!veto"},badges}},user);
  veto("viewer",[]);assert.equal(rounds.snapshot().phase,"building");const start=performance.now();veto("moderator",[{set_id:"moderator",id:"1",info:""}]);assert.deepEqual(admitted,[false,true]);assert.equal(rounds.snapshot().phase,"ideas");const outcome=await result;assert.equal(outcome.outcome,"REVERTED");assert.ok(performance.now()-start<2000,"Moderator cancellation must not wait for the build deadline");assert.throws(()=>process.kill(child,0));assert.equal(versions.pending,undefined);assert.equal((await git(root,"worktree","list","--porcelain")).split("worktree ").length-1,1);await runner.close();versions.close();
 }finally{client?.stop();rounds?.dispose();await rm(root,{recursive:true,force:true});}
});

test("a rejected fast-forward removes its new tag without changing master",async()=>{
 const root=await repository();let tree="";try{
  const baseline=await git(root,"rev-parse","HEAD");tree=await createTree(root,1,baseline);await writeFile(join(tree,"world/modules/a.ts"),"export default 2;\n");const candidate=await commitTree(tree,"Candidate");
  await writeFile(join(root,"world/modules/a.ts"),"export default 3;\n");const head=await commitTree(root,"User commit");await assert.rejects(promote(root,head,candidate,"v1"),/merge/);assert.equal(await git(root,"tag","--list","v1"),"");assert.equal(await git(root,"rev-parse","HEAD"),head);assert.equal(await readFile(join(root,"world/modules/a.ts"),"utf8"),"export default 3;\n");
 }finally{if(tree)await removeTree(root,tree);await rm(root,{recursive:true,force:true});}
});
test("fallback policy explicitly selects previous, healthy current or baseline",async()=>{
 const root=await mkdtemp(join(tmpdir(),"fallback-policy-")),versions=await knownVersions(root,()=>{});try{
  await versions.baselineAt("base");assert.equal(versions.fallbackTarget({allowBaseline:false}),null);assert.equal(versions.fallbackTarget({allowBaseline:true})!.tag,"v0");
  const one=await versions.artifact("one","world/modules/one.ts","export default 1;");await versions.activate({version:1,tag:"v1",commit:"one",title:"One",requester:"viewer",modules:[one]},false);
  assert.equal(versions.fallbackTarget({allowBaseline:false}),null);assert.equal(versions.fallbackTarget({excludingCommit:"interrupted",allowBaseline:false})!.tag,"v1");
  const two=await versions.artifact("two","world/modules/two.ts","export default 2;");await versions.activate({version:2,tag:"v2",commit:"two",title:"Two",requester:"viewer",modules:[two]},false);
  assert.equal(versions.fallbackTarget({allowBaseline:false})!.tag,"v1");assert.equal(versions.fallbackTarget({excludingCommit:"two",allowBaseline:true})!.tag,"v1");assert.equal(versions.fallbackTarget({excludingCommit:"interrupted",allowBaseline:true})!.tag,"v2");await versions.invalidate(2);assert.equal(versions.fallbackTarget({excludingCommit:"interrupted",allowBaseline:true})!.tag,"v1");
 }finally{versions.close();await rm(root,{recursive:true,force:true});}
});

async function retryRepository(){
 const root=await repository();await mkdir(join(root,"world/engine"));await writeFile(join(root,"world/engine/api.ts"),'import type {Group} from "three"; export interface WorldModule {id:string;init(s:{scene:Group}):void;update(dt:number):void;onChat():void;onCitizenSpawn():void;onRaid():void;dispose():void;}');await git(root,"add",".");await git(root,"-c","user.name=Test","-c","user.email=test@localhost","commit","--no-gpg-sign","-m","Locked API");return root;
}
const repairDecision=(description="repair")=>({verdict:"accept" as const,title:"Repair visual",reason:"Safe",spec:{moduleId:"repair",description,steps:["Create visual"],checks:["Dispose"],estimatedSeconds:60},files:["world/modules/repair.ts"],mode:"fixture" as const,latencyMs:0});
test("base reservation survives restart and an unknown baseline refuses work before creating a tree",async()=>{
 const root=await retryRepository();let called=0;try{
  const versions=new Versions(root,()=>{}),runner=new Runner({root,versions,feed(){},announce:async()=>{},builder:async()=>{called++;return{input:0,output:0,total:0};}});
  const result=await runner.build({requester:"viewer",signal:new AbortController().signal,decision:repairDecision()});assert.match(result.reason,/baseline is unknown/);assert.equal(called,0);assert.equal(result.attempts,0);assert.equal(versions.pending,undefined);assert.equal((await git(root,"worktree","list","--porcelain")).split("worktree ").length-1,1);
  const usage={nodes:20,triangles:114000,draws:20,lights:0,particles:216};assert.equal(await versions.reportBaseUsage(usage),true);const restored=new Versions(root,()=>{});await restored.init();assert.deepEqual(restored.baseUsage,usage);assert.equal(await restored.reportBaseUsage({...usage,particles:-1}),false);assert.deepEqual(restored.baseUsage,usage);await runner.close();versions.close();restored.close();
 }finally{await rm(root,{recursive:true,force:true});}
});
test("fake builder repairs a candidate rejection in the same worktree, gates again and ships once",async()=>{
 const root=await retryRepository(),feed:string[]=[],records:unknown[]=[],trees:string[]=[],timeouts:number[]=[];let checks=0,calls=0,versions!:Versions;
 const firstReason="Candidate is not stream-readable: needs 4096 contrasted 1080p pixel-equivalents and 64x64px in two of three probes (best 3600px).";
 try{
  versions=await knownVersions(root,v=>{if(v)void versions.acknowledge(v.version,v.receipt,true);});
  const runner=new Runner({root,versions,env:{PATH:process.env.PATH!,HOME:process.env.HOME!,AWS_BEARER_TOKEN_BEDROCK:"fixture-only"},bin:resolve("checks/fixtures/fake-builder.cjs"),feed:(_kind,text)=>feed.push(text),record:r=>{records.push(r);},announce:async()=>{},builder:async options=>{calls++;trees.push(options.tree);timeouts.push(options.timeoutMs!);assert.match(options.prompt!,/LOCKED_SELF_CHECK_COMMAND/);if(calls===2){assert.ok(options.prompt!.includes(JSON.stringify(firstReason)));assert.ok((await readFile(join(options.tree,options.decision.files[0]!),"utf8")).includes("0.03"));}return runCodex(options);},check:async(_root,modules)=>{checks++;assert.ok(modules.at(-1)!.code.includes(checks===1?"0.03":"2.2"));return checks===1?candidateRejected(firstReason):{ok:true,fps:60,avgFps:60};}});
  const result=await runner.build({requester:"viewer",signal:new AbortController().signal,decision:repairDecision()});assert.equal(result.outcome,"SHIPPED",result.reason);assert.equal(result.attempts,2);assert.equal(result.firstReason,firstReason);assert.equal(calls,2);assert.equal(checks,2);assert.equal(trees[0],trees[1]);assert.ok(timeouts[1]!<timeouts[0]!);assert.deepEqual(result.tokens,{input:200,output:400,total:600});assert.ok(feed.some(s=>s.startsWith("Retry 2/2")));assert.equal((records[0] as {attempts:number}).attempts,2);assert.equal(await git(root,"tag","--list"),"v1");assert.equal((await git(root,"worktree","list","--porcelain")).split("worktree ").length-1,1);await runner.close();versions.close();
 }finally{await rm(root,{recursive:true,force:true});}
});
test("guard rejections and outside-module diffs never invoke a repair",async()=>{
 const root=await retryRepository();let calls=0;try{
  const versions=await knownVersions(root,()=>{}),runner=new Runner({root,versions,env:{PATH:process.env.PATH!,HOME:process.env.HOME!,AWS_BEARER_TOKEN_BEDROCK:"fixture-only"},bin:resolve("checks/fixtures/fake-builder.cjs"),feed(){},announce:async()=>{},builder:options=>{calls++;return runCodex(options);}});
  const guard=await runner.build({requester:"viewer",signal:new AbortController().signal,decision:{verdict:"reject",title:"No",reason:"Unsafe",spec:null,files:[],mode:"fixture",latencyMs:0}});assert.equal(guard.outcome,"REVERTED");assert.equal(calls,0);assert.equal(guard.attempts,0);
  const outside=await runner.build({requester:"viewer",signal:new AbortController().signal,decision:repairDecision("outside")});assert.match(outside.reason,/outside approved/);assert.equal(calls,1);assert.equal(outside.attempts,1);assert.equal(outside.firstReason,undefined);assert.equal(await git(root,"tag","--list"),"");await runner.close();versions.close();
 }finally{await rm(root,{recursive:true,force:true});}
});
test("resource rejections get one repair then retain the final reason; checker timeouts never retry",async()=>{
 for(const timeout of [false,true]){
  const root=await retryRepository();let calls=0;try{
   const versions=await knownVersions(root,()=>{});if(!timeout)await versions.reportBaseUsage({nodes:0,triangles:129999,draws:0,lights:0,particles:0});
   const runner=new Runner({root,versions,env:{PATH:process.env.PATH!,HOME:process.env.HOME!,AWS_BEARER_TOKEN_BEDROCK:"fixture-only"},bin:resolve("checks/fixtures/fake-builder.cjs"),feed(){},announce:async()=>{},builder:options=>{calls++;return runCodex(options);},check:async()=>infrastructureFailed("Candidate checker timed out.")});
   const result=await runner.build({requester:"viewer",signal:new AbortController().signal,decision:repairDecision()});assert.equal(result.outcome,"REVERTED");assert.equal(calls,timeout?1:2);assert.match(result.reason,timeout?/timed out/:/triangles world limit/);assert.equal(result.attempts,calls);assert.equal(await git(root,"tag","--list"),"");await runner.close();versions.close();
  }finally{await rm(root,{recursive:true,force:true});}
 }
});

test("fixed active-module capacity refuses work before creating a tree or invoking the builder",async()=>{
 const root=await retryRepository();let calls=0;try{
  const versions=await knownVersions(root,()=>{}),modules=[];
  for(let i=0;i<ACTIVE_MODULE_CAP;i++)modules.push(await versions.artifact(`existing-${i}`,`world/modules/existing-${i}.ts`,`export default()=>({id:"existing-${i}",init(){},update(){},onChat(){},onCitizenSpawn(){},onRaid(){},dispose(){}});`));
  await versions.activate({version:1,tag:"v1",commit:await git(root,"rev-parse","HEAD"),title:"Full world",requester:"fixture",modules},false);
  const runner=new Runner({root,versions,feed(){},announce:async()=>{},builder:async()=>{calls++;return{input:0,output:0,total:0};}});
  const refused=await runner.build({requester:"viewer",signal:new AbortController().signal,decision:repairDecision()});assert.match(refused.reason,/active modules maximum/);assert.equal(refused.attempts,0);assert.equal(calls,0);assert.equal(versions.pending,undefined);assert.equal((await git(root,"worktree","list","--porcelain")).split("worktree ").length-1,1);
  const replace=repairDecision();replace.spec.moduleId="existing-0";replace.files=["world/modules/existing-0.ts"];
  const allowed=await runner.build({requester:"viewer",signal:new AbortController().signal,decision:replace});assert.equal(allowed.attempts,1);assert.match(allowed.reason,/no module changes/);assert.equal(calls,1);await runner.close();versions.close();
 }finally{await rm(root,{recursive:true,force:true});}
});
test("infrastructure and unclassified checker failures do not opt in to a repair",async()=>{
 for(const verdict of [infrastructureFailed("Candidate checker returned no valid verdict."),{ok:false,reason:"Unclassified checker failure"} as CheckResult]){
  const root=await retryRepository();let calls=0;try{
   const versions=await knownVersions(root,()=>{}),runner=new Runner({root,versions,env:{PATH:process.env.PATH!,HOME:process.env.HOME!,AWS_BEARER_TOKEN_BEDROCK:"fixture-only"},bin:resolve("checks/fixtures/fake-builder.cjs"),feed(){},announce:async()=>{},builder:options=>{calls++;return runCodex(options);},check:async()=>verdict});
   const result=await runner.build({requester:"viewer",signal:new AbortController().signal,decision:repairDecision()});assert.equal(result.outcome,"REVERTED");assert.equal(result.attempts,1);assert.equal(calls,1);assert.equal(result.firstReason,undefined);await runner.close();versions.close();
  }finally{await rm(root,{recursive:true,force:true});}
 }
});

test("runner forwards only approved spec command names into the candidate gate",async()=>{
 const root=await retryRepository();let versions!:Versions,seen:readonly string[]=[];try{
  versions=await knownVersions(root,v=>{if(v)void versions.acknowledge(v.version,v.receipt,true);});
  const runner=new Runner({root,versions,env:{PATH:process.env.PATH!,HOME:process.env.HOME!,AWS_BEARER_TOKEN_BEDROCK:'fixture-only'},bin:resolve('checks/fixtures/fake-builder.cjs'),feed(){},announce:async()=>{},check:async(_root,_modules,_id,_signal,commands)=>{seen=commands??[];return {ok:true};}});
  const decision=repairDecision('good');decision.spec.steps=['Respond to !race and !dig'];const result=await runner.build({requester:'Player',signal:new AbortController().signal,decision});assert.equal(result.ok,true,result.reason);assert.deepEqual(seen,['!race','!dig']);await runner.close();
 }finally{versions?.close();await rm(root,{recursive:true,force:true});}
});

test("builder time reserves the full self-check and gate; gate cannot start late",async()=>{
 const {builderAllowance,requireGateTime,BUILD_CHECK_RESERVE_MS}=await import('../server/runner/index.js');
 assert.equal(builderAllowance(180000),180000-BUILD_CHECK_RESERVE_MS);assert.equal(builderAllowance(BUILD_CHECK_RESERVE_MS-1),0);
 assert.throws(()=>requireGateTime(1,'Original visibility rejection'),{message:'Original visibility rejection'});
 assert.throws(()=>requireGateTime(1),/complete candidate gate/);
});

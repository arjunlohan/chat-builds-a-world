import { Runner } from "../server/runner/index.js";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { git, inventory, auditDiff, cleanMaster, createTree, removeTree, commitTree, promote } from "../server/runner/git.js";
import { inspectModule } from "../server/runner/policy.js";
import { readableEvent } from "../server/runner/events.js";
import { runnerPrompt, runCodex } from "../server/runner/codex.js";
import { Versions } from "../server/versions/index.js";
import { Rounds } from "../server/rounds/index.js";
async function repository() {
  const root = await mkdtemp(join(tmpdir(), "runner-unit-")); await mkdir(join(root, "world/modules"), { recursive: true });
  await writeFile(join(root, "README.md"), "session file\n"); await writeFile(join(root, ".gitignore"), "state/\nworktrees/\n.env\n");
  await writeFile(join(root, "world/modules/a.ts"), "export default () => ({});\n");
  await git(root, "init", "-b", "master"); await git(root, "add", "."); await git(root, "-c", "user.name=Test", "-c", "user.email=test@localhost", "commit", "--no-gpg-sign", "-m", "Base"); return root;
}
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
 const root=process.cwd(), prompt=await runnerPrompt(root,decision);assert.ok(prompt.includes("2 ms total per frame"));assert.ok(prompt.endsWith(JSON.stringify({title:decision.title,spec:decision.spec,files:decision.files})));
 const controller=new AbortController();const pending=runCodex({root,tree:root,bin:resolve("checks/fixtures/fake-builder.cjs"),env:{PATH:process.env.PATH!,HOME:process.env.HOME!,AWS_BEARER_TOKEN_BEDROCK:"synthetic-not-a-key",TWITCH_ACCESS_TOKEN:"forbidden"},decision,signal:controller.signal,feed(){}});
 setTimeout(()=>controller.abort(),100);await assert.rejects(()=>pending,/cancelled/);
});
test("version recovery checks artifact hashes and receipt identity",async()=>{
 const root=await mkdtemp(join(tmpdir(),"versions-unit-"));
 try { const store=new Versions(root,()=>{});const module=await store.artifact("test","world/modules/test.ts","export default () => ({});");
  await store.activate({version:1,tag:"v1",commit:"base",title:"Test",requester:"viewer",modules:[module]},false);
  assert.equal(store.acknowledge(1,"wrong",true),false);assert.equal(store.acknowledge(1,store.current!.receipt,true),true);
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
  const head=await git(root,"rev-parse","HEAD"),versions=new Versions(root,()=>{});
  const runner=new Runner({root,versions,env:{PATH:process.env.PATH!,HOME:process.env.HOME!,AWS_BEARER_TOKEN_BEDROCK:secret},bin:resolve("checks/fixtures/fake-builder.cjs"),feed:(_kind,text)=>feed.push(text),announce:async()=>{}});
  const result=await runner.build({requester:"viewer",signal:new AbortController().signal,decision:{verdict:"accept",title:"Test",reason:"Fixture",spec:{moduleId:"security",description:"protected",steps:["Small visual"],checks:["Cleanup"],estimatedSeconds:60},files:["world/modules/security.ts"],mode:"live",latencyMs:0}});
  assert.equal(result.ok,false);assert.match(result.reason,/protected data/);assert.ok(!JSON.stringify({result,feed}).includes(secret));assert.equal(await git(root,"rev-parse","HEAD"),head);
 }finally{await rm(root,{recursive:true,force:true})}
});

test("failed live acknowledgement restores module content with a forward commit and cleans the tree",async()=>{
 const root=await repository();
 try {
  await mkdir(join(root,"world/engine"));await writeFile(join(root,"world/engine/api.ts"),'import type {Group} from "three"; export interface WorldModule {id:string;init(s:{scene:Group}):void;update(dt:number):void;onChat():void;onCitizenSpawn():void;onRaid():void;dispose():void;}');
  await writeFile(join(root,"AGENTS.md"),"## World Module API v1\nSynchronous hooks only.\n## Scene Spec v1\n");await git(root,"add",".");await git(root,"-c","user.name=Test","-c","user.email=test@localhost","commit","--no-gpg-sign","-m","Contract");
  const baseline=await git(root,"rev-parse","HEAD");let versions!:Versions;
  versions=new Versions(root,version=>{if(version)versions.acknowledge(version.version,version.receipt,false)});
  const runner=new Runner({root,versions,env:{PATH:process.env.PATH!,HOME:process.env.HOME!,AWS_BEARER_TOKEN_BEDROCK:"synthetic-fixture-secret"},feed(){},announce:async()=>{},check:async()=>({ok:true,fps:60,avgFps:60})});
  const result=await runner.build({requester:"viewer",signal:new AbortController().signal,decision:{verdict:"accept",title:"Test",reason:"Fixture",spec:{moduleId:"activation",description:"good",steps:["Small visual"],checks:["Cleanup"],estimatedSeconds:60},files:["world/modules/activation.ts"],mode:"fixture",latencyMs:0}});
  assert.equal(result.ok,false);assert.match(result.reason,/activation/);assert.equal(versions.current!.modules.length,0);
  assert.equal(await git(root,"diff",baseline,"HEAD","--","world/modules"),"");assert.equal(await git(root,"rev-list","--count",`${baseline}..HEAD`),"2");
  assert.equal(await git(root,"status","--porcelain","--untracked-files=all"),"");assert.equal((await git(root,"worktree","list","--porcelain")).split("worktree ").length-1,1);versions.close();
 }finally{await rm(root,{recursive:true,force:true})}
});

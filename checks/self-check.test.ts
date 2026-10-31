import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,cp,mkdir,writeFile,rm,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {exec,execFile} from "node:child_process";
import {promisify} from "node:util";
import {existsSync} from "node:fs";
import {selfCheck,selfCheckManifest,selfCheckCommand,resourceCheck} from "../server/runner/self-check.js";
import {GLOBAL_CAP,SUMMON_POOL,emptyUsage,modulePool} from "../world/shared/limits.js";
test("locked CLI and runner share static/type/resource admission with a live base reservation",async()=>{
 const root=await mkdtemp(join(tmpdir(),"self-check-")),file="world/modules/check.ts",signal=new AbortController().signal;
 try{
  await cp("world",join(root,"world"),{recursive:true});await cp("server",join(root,"server"),{recursive:true});await mkdir(join(root,"state"));
  const source=(await readFile("checks/fixtures/modules/particles.ts","utf8")).replace("../../../world/engine/api.js","../engine/api.js").replace("FIXTURE_ID","check");await writeFile(join(root,file),source);
  const input={file,id:"check",files:[file],retained:[],base:emptyUsage()},manifest=await selfCheckManifest(root,input);
  const direct=await selfCheck(root,input,signal);assert.equal(direct.resources.ok,true,direct.resources.reason);assert.equal(direct.resources.usage!.particles,152);
  const cli=await promisify(exec)(selfCheckCommand(manifest),{cwd:root,env:{PATH:process.env.PATH,HOME:process.env.HOME},timeout:15000});assert.deepEqual(JSON.parse(cli.stdout),{ok:true,checks:["policy","types"],resources:"runner-only"});
  const denied={...input,base:{...emptyUsage(),triangles:GLOBAL_CAP.triangles-SUMMON_POOL.triangles-1}};assert.match((await selfCheck(root,denied,signal)).resources.reason!,/triangles world limit/);
  await writeFile(join(root,file),source.replace('Points, PointsMaterial','WebGLRenderer, Points, PointsMaterial'));const policy=await selfCheck(root,input,signal);assert.match(policy.resources.reason!,/Only vetted/);assert.equal(policy.resources.category,"candidate");assert.equal(policy.resources.retryable,true);
  await writeFile(join(root,file),source.replace('time=0','time: string=0'));const types=await selfCheck(root,input,signal);assert.match(types.resources.reason!,/TypeScript/);assert.equal(types.resources.category,"candidate");
 }finally{await rm(root,{recursive:true,force:true});}
});
const sandboxBin=process.env.CODEX_BIN??"/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex";
test("exact rendered self-check runs under the builder workspace-write sandbox without a model",{skip:process.platform!=="darwin"||!existsSync(sandboxBin)},async()=>{
 const root=await mkdtemp(join(tmpdir(),"sandbox-self-check-")),file="world/modules/sandbox.ts";
 try{
  await cp("world",join(root,"world"),{recursive:true});await cp("server",join(root,"server"),{recursive:true});
  const source=(await readFile("checks/fixtures/modules/good.ts","utf8")).replace("../../../world/engine/api.js","../engine/api.js").replace("FIXTURE_ID","sandbox");await writeFile(join(root,file),source);
  const manifest=await selfCheckManifest(root,{file,id:"sandbox",files:[file],retained:[]}),command=selfCheckCommand(manifest),home=join(root,"codex-home");await mkdir(home);
  const bin=sandboxBin;
  const result=await promisify(execFile)(bin,["sandbox","-P",":workspace","-C",root,"--","/bin/sh","-c",command],{env:{PATH:process.env.PATH,HOME:process.env.HOME,CODEX_HOME:home},timeout:15000});
  assert.deepEqual(JSON.parse(result.stdout),{ok:true,checks:["policy","types"],resources:"runner-only"});
  const full=await promisify(execFile)(bin,["sandbox","-P",":workspace","-C",root,"--","/bin/sh","-c",command.replace(" '--static-only'","")],{env:{PATH:process.env.PATH,HOME:process.env.HOME,CODEX_HOME:home},timeout:15000}).then(r=>({code:0,stdout:r.stdout}),e=>({code:e.code,stdout:e.stdout as string}));
  assert.notEqual(full.code,0,"The builder must leave resource/browser admission to the runner in this sandbox");
  await mkdir("state",{recursive:true});await writeFile("state/gatec3-sandbox.json",JSON.stringify({profile:":workspace",command,static:JSON.parse(result.stdout),resourceCommandExit:full.code,resourceCommandOutput:full.stdout,providerCalls:0},null,2));
  // No socket allowance, network access or writable roots were added to make it pass.
 }finally{await rm(root,{recursive:true,force:true});}
});
test("retained resources count against the pool before the new candidate",async()=>{
 const code='import {Points,PointsMaterial,BufferGeometry,Float32BufferAttribute} from "/assets/three.js";export default ()=>({id:"retained",init(s){const g=new BufferGeometry();g.setAttribute("position",new Float32BufferAttribute(new Float32Array(30),3));s.scene.add(new Points(g,new PointsMaterial()));},update(){},onChat(){},onCitizenSpawn(){},onRaid(){},dispose(){}});';
 const input={base:emptyUsage(),retained:[{id:"retained",file:"world/modules/retained.ts",code}]};const result=await resourceCheck(input,input.retained,new AbortController().signal);assert.equal(result.ok,true,result.reason);assert.equal(result.retained!.particles,10);assert.equal(result.available!.particles,GLOBAL_CAP.particles-SUMMON_POOL.particles-10);
});
test("a standalone probe without base facts still reserves the summon pool",async()=>{
 const result=await resourceCheck({retained:[]},[],new AbortController().signal);assert.equal(result.ok,true,result.reason);assert.deepEqual(result.pool,modulePool(emptyUsage()));
});

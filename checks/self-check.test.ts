import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,cp,mkdir,writeFile,rm,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {exec} from "node:child_process";
import {promisify} from "node:util";
import {selfCheck,selfCheckManifest,selfCheckCommand,resourceCheck} from "../server/runner/self-check.js";
import {GLOBAL_CAP,SUMMON_POOL,emptyUsage} from "../world/shared/limits.js";
test("locked CLI and runner share static/type/resource admission with a live base reservation",async()=>{
 const root=await mkdtemp(join(tmpdir(),"self-check-")),file="world/modules/check.ts",signal=new AbortController().signal;
 try{
  await cp("world",join(root,"world"),{recursive:true});await cp("server",join(root,"server"),{recursive:true});await mkdir(join(root,"state"));
  const source=(await readFile("checks/fixtures/modules/particles.ts","utf8")).replace("../../../world/engine/api.js","../engine/api.js").replace("FIXTURE_ID","check");await writeFile(join(root,file),source);
  const input={file,id:"check",files:[file],retained:[],base:emptyUsage()},manifest=await selfCheckManifest(root,input);
  const direct=await selfCheck(root,input,signal);assert.equal(direct.resources.ok,true,direct.resources.reason);assert.equal(direct.resources.usage!.particles,152);
  const cli=await promisify(exec)(selfCheckCommand(manifest),{cwd:root,env:{PATH:process.env.PATH,HOME:process.env.HOME},timeout:15000});assert.deepEqual(JSON.parse(cli.stdout),direct.resources);
  const denied={...input,base:{...emptyUsage(),triangles:GLOBAL_CAP.triangles-SUMMON_POOL.triangles-1}};assert.match((await selfCheck(root,denied,signal)).resources.reason!,/triangles world limit/);
  await writeFile(join(root,file),source.replace('Points, PointsMaterial','WebGLRenderer, Points, PointsMaterial'));await assert.rejects(selfCheck(root,input,signal),/Only vetted/);
  await writeFile(join(root,file),source.replace('time=0','time: string=0'));await assert.rejects(selfCheck(root,input,signal),/TypeScript/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test("retained resources count against the pool before the new candidate",async()=>{
 const code='import {Points,PointsMaterial,BufferGeometry,Float32BufferAttribute} from "/assets/three.js";export default ()=>({id:"retained",init(s){const g=new BufferGeometry();g.setAttribute("position",new Float32BufferAttribute(new Float32Array(30),3));s.scene.add(new Points(g,new PointsMaterial()));},update(){},onChat(){},onCitizenSpawn(){},onRaid(){},dispose(){}});';
 const input={base:emptyUsage(),retained:[{id:"retained",file:"world/modules/retained.ts",code}]};const result=await resourceCheck(input,input.retained,new AbortController().signal);assert.equal(result.ok,true,result.reason);assert.equal(result.retained!.particles,10);assert.equal(result.available!.particles,GLOBAL_CAP.particles-SUMMON_POOL.particles-10);
});

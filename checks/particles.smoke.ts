import assert from "node:assert/strict";
import {readFile,mkdir,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {mkdtemp} from "node:fs/promises";
import {compileModule,inspectModule} from "../server/runner/policy.js";
import {candidateCheck} from "../server/runner/check.js";
const root=process.cwd(),tree=await mkdtemp(join(tmpdir(),"particle-policy-")),file="world/modules/particle-fixture.ts";
try{
 const source=(await readFile("checks/fixtures/modules/particles.ts","utf8")).replace("../../../world/engine/api.js","../engine/api.js").replace("FIXTURE_ID","particle-fixture");
 inspectModule(source,file);
 assert.throws(()=>inspectModule(source.replace("Points, PointsMaterial","WebGLRenderer, Points, PointsMaterial"),file),/Only vetted named/);
 // Compile against the actual locked API, in an isolated directory, before the real gate.
 const {cp}=await import("node:fs/promises");await cp(join(root,"world"),join(tree,"world"),{recursive:true});await cp(join(root,"server"),join(tree,"server"),{recursive:true});await mkdir(join(tree,"world/modules"),{recursive:true});await writeFile(join(tree,file),source);
 const compiled=await compileModule(tree,file,"particle-fixture",join(root,"node_modules"));
 const result=await candidateCheck(root,[{...compiled,file}],compiled.id,new AbortController().signal);
 await mkdir("state",{recursive:true});await writeFile("state/particle-gate.json",JSON.stringify(result,null,2));console.log(JSON.stringify(result));assert.equal(result.ok,true,result.reason);
}finally{await rm(tree,{recursive:true,force:true});}

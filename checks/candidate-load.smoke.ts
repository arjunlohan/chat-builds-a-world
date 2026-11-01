import assert from "node:assert/strict";
import {spawn,type ChildProcess} from "node:child_process";
import {availableParallelism} from "node:os";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {build} from "esbuild";
import {candidateCheck} from "../server/runner/check.js";
const results:unknown[]=[];
// Separate processes compete for real CPU time. They never alter browser clocks or gate thresholds.
const workers=Math.max(2,Math.min(6,availableParallelism()-2));
const loadSource='let value=1;function burn(){const end=Date.now()+60;while(Date.now()<end){for(let i=0;i<10000;i++)value=Math.sqrt(value+i+1);}setTimeout(burn,20);}burn();';
for(const loaded of [false,true]){
 const children:ChildProcess[]=loaded?Array.from({length:workers},()=>spawn(process.execPath,["-e",loadSource],{env:{PATH:process.env.PATH,HOME:process.env.HOME},stdio:"ignore"})):[];
 try{
  if(loaded)await new Promise(r=>setTimeout(r,600));
  for(const kind of ["good","slow"]){
   const id=`cost-${kind}`,source=(await readFile(`checks/fixtures/modules/${kind}.ts`,"utf8")).replace("FIXTURE_ID",id);
   const code=(await build({stdin:{contents:source,loader:"ts",resolveDir:process.cwd()},bundle:true,format:"esm",platform:"browser",write:false,plugins:[{name:"shared-three",setup(b){b.onResolve({filter:/^three$/},()=>({path:"/assets/three.js",external:true}));}}]})).outputFiles[0]!.text;
   const result=await candidateCheck(process.cwd(),[{id,file:`world/modules/${id}.ts`,code}],id,new AbortController().signal);
   const entry={kind,loaded,workers:children.length,...result};results.push(entry);console.log(JSON.stringify(entry));assert.equal(result.ok,kind==="good",result.reason);
   if(kind==="slow")assert.match(result.reason!,/overrun|hook CPU|relative FPS|render/);
   else {const evidence=JSON.parse(await readFile(result.evidence+"/evidence.json","utf8"));assert.ok(evidence.baseline.summary.frames>0);assert.ok(evidence.candidate.summary.frames>0);assert.equal(evidence.status,"passed");}
  }
 }finally{for(const child of children)child.kill("SIGTERM");await Promise.all(children.map(child=>child.exitCode!==null?Promise.resolve():new Promise<void>(r=>child.once("exit",()=>r()))));}
}
await mkdir("state",{recursive:true});await writeFile("state/candidate-load-results.json",JSON.stringify(results,null,2)+"\n");console.log("PASS: cheap passes and expensive fails, with and without parallel CPU load.");

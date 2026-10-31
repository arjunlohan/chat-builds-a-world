import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {jsonWorker,isVerdict} from "../server/runtime/json-worker.js";
test("a final verdict before the deadline survives slow cleanup and its process is killed",async()=>{
 const root=await mkdtemp(join(tmpdir(),"slow-cleanup-"));try{
  const script=join(root,"check.mjs");await writeFile(script,'console.log(JSON.stringify({ok:true,fps:45})); setInterval(()=>{},1000);');
  const start=performance.now(),result=await jsonWorker({script,signal:new AbortController().signal,timeoutMs:1500,verdict:isVerdict});assert.deepEqual(result.verdict,{ok:true,fps:45});assert.equal(result.error,undefined);assert.ok(performance.now()-start<1500);
  await writeFile(script,'console.log(JSON.stringify({ok:false,reason:"FPS below 40"})); setInterval(()=>{},1000);');const rejected=await jsonWorker({script,signal:new AbortController().signal,timeoutMs:1500,verdict:isVerdict});assert.deepEqual(rejected.verdict,{ok:false,reason:"FPS below 40"});
 }finally{await rm(root,{recursive:true,force:true});}
});
test("missing or late terminal output is an infrastructure failure, never a passing verdict",async()=>{
 const root=await mkdtemp(join(tmpdir(),"missing-verdict-"));try{
  const script=join(root,"check.mjs");await writeFile(script,'console.log("not a verdict");');assert.equal((await jsonWorker({script,signal:new AbortController().signal,timeoutMs:1500,verdict:isVerdict})).verdict,undefined);
  await writeFile(script,'setTimeout(()=>console.log(JSON.stringify({ok:true})),1200);');const late=await jsonWorker({script,signal:new AbortController().signal,timeoutMs:500,verdict:isVerdict});assert.equal(late.verdict,undefined);assert.match(late.error!,/timed out/);
 }finally{await rm(root,{recursive:true,force:true});}
});

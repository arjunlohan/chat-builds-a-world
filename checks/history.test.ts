import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Versions } from "../server/versions/index.js";
import { createWorldServer } from "../server/http.js";
import { WorldPipeline } from "../server/pipeline.js";
test("history includes healthy shipped chapters in order, without live receipts or mutable references",async()=>{
 const root=await mkdtemp(join(tmpdir(),"world-history-")),versions=new Versions(root,()=>{});
 try{
  assert.deepEqual(versions.replay(),[]);const module=await versions.artifact("lantern","world/modules/lantern.ts","export default () => ({});");
  for(const version of [1,2])await versions.activate({version,tag:`v${version}`,commit:`commit${version}`,title:`Chapter ${version}`,requester:`Viewer${version}`,modules:[module]},false);
  await versions.invalidate(2);assert.deepEqual(versions.replay().map(v=>v.version),[1]);
  await versions.activate({version:3,tag:"v3",commit:"third",title:"Return",requester:"Fern",modules:[module]},false);
  const chapters=versions.replay();assert.deepEqual(chapters.map(v=>v.version),[1,3]);assert.ok(!("receipt" in chapters[0]!));chapters[0]!.modules.length=0;assert.equal(versions.replay()[0]!.modules.length,1);
  const restored=new Versions(root,()=>{});await restored.init();assert.deepEqual(restored.replay(),versions.replay());restored.close();
 }finally{versions.close();await rm(root,{recursive:true,force:true});}
});
test("fresh history endpoint has a clear empty state and uses a local playback bundle",async()=>{
 const app=await createWorldServer(new WorldPipeline());await new Promise<void>(r=>app.server.listen(0,"127.0.0.1",r));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
 try{assert.deepEqual(await (await fetch(base+"/api/history")).json(),{versions:[]});const html=await (await fetch(base+"/history")).text();assert.ok(html.includes('/assets/history.js'));assert.equal((await fetch(base+"/assets/history.js")).status,200);}
 finally{app.closeStreams();await new Promise<void>(r=>app.server.close(()=>r()));}
});

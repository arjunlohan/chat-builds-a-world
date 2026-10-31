import assert from "node:assert/strict";
import {writeFile,mkdir} from "node:fs/promises";
import {resolve,join} from "node:path";
import {fixtureServer,waitFor,worktreeCount} from "./fixture-server.js";
import {launchWorldPage} from "./browser.js";
import {WorldPipeline} from "../server/pipeline.js";
import {Versions} from "../server/versions/index.js";
import {Runner} from "../server/runner/index.js";
import {createWorldServer} from "../server/http.js";
const source=process.cwd(),fixture=await fixtureServer(source,{prefix:"world-retry-smoke-"}),pipeline=new WorldPipeline();
const versions=new Versions(fixture.root,v=>pipeline.publish({type:"version",version:v}));await versions.init();
const app=await createWorldServer(pipeline,undefined,undefined,versions);await new Promise<void>(r=>app.server.listen(fixture.port,"127.0.0.1",r));
let world:Awaited<ReturnType<typeof launchWorldPage>>|undefined;const feed:string[]=[],metrics:unknown[]=[];
try{
 world=await launchWorldPage(fixture.base,"overlay=1");let reloads=0;world.page.on("load",()=>reloads++);await waitFor(async()=>versions.baseUsage,v=>!!v);
 const cdp=await world.page.context().newCDPSession(world.page);await cdp.send("Page.setWebLifecycleState",{state:"frozen"});
 const runner=new Runner({root:fixture.root,versions,bin:resolve("checks/fixtures/fake-builder.cjs"),env:{PATH:process.env.PATH!,HOME:process.env.HOME!,AWS_BEARER_TOKEN_BEDROCK:"offline-repair-fixture"},record:r=>{metrics.push(r);},feed:(kind,text)=>{feed.push(text);if(kind==="ship")void cdp.send("Page.setWebLifecycleState",{state:"active"});},announce:async()=>{}});
 const result=await runner.build({requester:"RepairViewer",signal:new AbortController().signal,decision:{verdict:"accept",title:"Repairable lantern",reason:"Offline fixture",spec:{moduleId:"repair-smoke",description:"repair",steps:["Create one visual"],checks:["Dispose"],estimatedSeconds:60},files:["world/modules/repair-smoke.ts"],mode:"fixture",latencyMs:0}});
 await cdp.send("Page.setWebLifecycleState",{state:"active"});const report={...result,reloads,errors:world.errors,feed,metrics,worktrees:await worktreeCount(fixture.root),base:versions.baseUsage};
 await mkdir(join(source,"state"),{recursive:true});await writeFile(join(source,"state/runner-retry-smoke.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 assert.equal(result.outcome,"SHIPPED",result.reason);assert.equal(result.attempts,2);assert.match(result.firstReason!,/stream-readable/);assert.equal(reloads,0);assert.deepEqual(world.errors,[]);assert.equal(report.worktrees,1);assert.equal(versions.current?.healthy,true);await runner.close();
}finally{await world?.browser.close();versions.close();app.closeStreams();await new Promise<void>(r=>app.server.close(()=>r()));await fixture.dispose();}

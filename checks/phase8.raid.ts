import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {launchWorldPage,measureFps} from "./browser.js";
import {createWorldServer} from "../server/http.js";
import {WorldPipeline} from "../server/pipeline.js";
import {QUIET_MS, RAID_CAP} from "../world/shared/limits.js";
import {raidFixture} from "../server/twitch/raid.js";
let now=Date.now();const pipeline=new WorldPipeline(()=>now);
for(let i=0;i<150;i++)pipeline.chat({id:`seed-${i}`,userId:`seed-${i}`,displayName:`Neighbor${i}`,color:"#79D7CF",text:"hello"});
now+=QUIET_MS;
for(let i=150;i<300;i++)pipeline.chat({id:`seed-${i}`,userId:`seed-${i}`,displayName:`Neighbor${i}`,color:"#E9B47D",text:"hello"});
const app=await createWorldServer(pipeline,undefined,undefined,undefined,{broadcasterId:"target",simulationAllowed:true,live:false,async fault(){}});await new Promise<void>(r=>app.server.listen(0,"127.0.0.1",r));
const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
const {browser,page,gpu,errors}=await launchWorldPage(base,"overlay=1&debug=1");
try{
 await page.waitForFunction(()=>window.__worldStats.citizenCount===300);
 const response=await fetch(base+"/sim/eventsub",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(raidFixture("target",150,"AuroraCrew","phase8-150"))});const result=await response.json() as {admitted:number;count:number;replaced:number};assert.equal(result.admitted,150);assert.equal(result.replaced,150);assert.equal(result.count,300);
 const initialRaidLabels=await page.locator('.citizen-label[data-visitor="true"]').count();assert.ok(initialRaidLabels<150,`Raider labels must be lazy, observed ${initialRaidLabels} immediately`);
 await page.waitForFunction(()=>window.__worldStats.citizenCount===300&&window.__worldStats.raidPortalActive);await page.waitForTimeout(2500);await mkdir("state",{recursive:true});await page.screenshot({path:"state/phase8-raid-150.png"});
 const timing=await measureFps(page,15000),measured={frame:timing.stats.frame,stats:timing.stats,framebuffer:await page.evaluate(()=>[document.querySelector("canvas")!.width,document.querySelector("canvas")!.height]),renderer:gpu};
 const data={...result,preRaidCitizens:300,raiders:pipeline.roster.list().filter(c=>c.entry).length,remainingCitizens:pipeline.roster.list().filter(c=>!c.entry).length,production:true,initialRaidLabels,fps:timing.fps,...measured,errors,screenshot:"state/phase8-raid-150.png"};await writeFile("state/phase8-raid-performance.json",JSON.stringify(data,null,2));console.log(JSON.stringify(data));assert.equal(errors.length,0);assert.deepEqual(measured.framebuffer,[1920,1080]);assert.ok(!/swiftshader|llvmpipe/i.test(measured.renderer));assert.equal(measured.stats.citizenCount,300);assert.ok(data.fps>=58,`Expected ~60 fps, measured ${data.fps}`);
 // Reconnect restores the active arrival without another raid or duplicate citizens.
 await page.reload();await page.waitForFunction(()=>window.__worldStats.raidPortalActive&&window.__worldStats.citizenCount===300);assert.equal(pipeline.snapshot().raids,1);
}finally{await browser.close();app.closeStreams();await new Promise<void>(r=>app.server.close(()=>r()));}

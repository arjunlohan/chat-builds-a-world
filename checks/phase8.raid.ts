import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {chromium} from "@playwright/test";
import {createWorldServer} from "../server/http.js";
import {WorldPipeline} from "../server/pipeline.js";
import {IDLE_MS} from "../world/shared/limits.js";
import {raidFixture} from "../server/twitch/raid.js";
let now=Date.now();const pipeline=new WorldPipeline(()=>now);
for(let i=0;i<150;i++)pipeline.chat({id:`seed-${i}`,userId:`seed-${i}`,displayName:`Neighbor${i}`,color:"#79D7CF",text:"hello"});
now+=IDLE_MS;
for(let i=150;i<300;i++)pipeline.chat({id:`seed-${i}`,userId:`seed-${i}`,displayName:`Neighbor${i}`,color:"#E9B47D",text:"hello"});
const app=await createWorldServer(pipeline,undefined,undefined,undefined,{broadcasterId:"target",simulationAllowed:true,live:false,async fault(){}});await new Promise<void>(r=>app.server.listen(0,"127.0.0.1",r));
const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`,browser=await chromium.launch({headless:true,args:process.platform==="darwin"?["--use-angle=metal","--enable-gpu"]:["--enable-gpu"]});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",e=>{if(e.type()==="error")errors.push(e.text());});
 await page.goto(base+"/world?overlay=1&debug=1");await page.waitForFunction(()=>window.__worldStats.citizenCount===300);await page.waitForSelector('canvas[data-ready="true"]');
 const response=await fetch(base+"/sim/eventsub",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(raidFixture("target",150,"AuroraCrew","phase8-150"))});const result=await response.json() as {admitted:number;count:number;replaced:number};assert.equal(result.admitted,150);assert.equal(result.replaced,150);assert.equal(result.count,300);
 await page.waitForFunction(()=>window.__worldStats.citizenCount===300&&window.__worldStats.raidPortalActive);await page.waitForTimeout(2500);await mkdir("state",{recursive:true});await page.screenshot({path:"state/phase8-raid-150.png"});
 const start=await page.evaluate(()=>({frame:window.__worldStats.frame,time:performance.now()}));await page.waitForTimeout(15000);
 const measured=await page.evaluate(()=>{const canvas=document.querySelector("canvas")!,gl=canvas.getContext("webgl2")!,info=gl.getExtension("WEBGL_debug_renderer_info");return {frame:window.__worldStats.frame,time:performance.now(),stats:window.__worldStats,framebuffer:[canvas.width,canvas.height],renderer:info?String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)):""};});
 const data={...result,preRaidCitizens:300,raiders:pipeline.roster.list().filter(c=>c.raid).length,remainingCitizens:pipeline.roster.list().filter(c=>!c.raid).length,production:true,fps:1000*(measured.frame-start.frame)/(measured.time-start.time),...measured,errors,screenshot:"state/phase8-raid-150.png"};await writeFile("state/phase8-raid-performance.json",JSON.stringify(data,null,2));console.log(JSON.stringify(data));assert.equal(errors.length,0);assert.deepEqual(measured.framebuffer,[1920,1080]);assert.ok(!/swiftshader|llvmpipe/i.test(measured.renderer));assert.equal(measured.stats.citizenCount,300);assert.ok(data.fps>=58,`Expected ~60 fps, measured ${data.fps}`);
 // Reconnect restores the active arrival without another raid or duplicate citizens.
 await page.reload();await page.waitForFunction(()=>window.__worldStats.raidPortalActive&&window.__worldStats.citizenCount===300);assert.equal(pipeline.snapshot().raids,1);
}finally{await browser.close();app.closeStreams();await new Promise<void>(r=>app.server.close(()=>r()));}

import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { createWorldServer } from "../server/http.js";
import { WorldPipeline } from "../server/pipeline.js";
import { Versions } from "../server/versions/index.js";
import { frameVerdict, visibilityVerdict, type FrameEvidence } from "./candidate-policy.js";
import { VISIBILITY_PROBE, type Footprint } from "../world/engine/visibility.js";
const path=process.argv[2]!,directory=dirname(path),input=JSON.parse(await readFile(path,"utf8")) as {modules:{id:string;file:string;code:string}[];probeId:string};
const state=await mkdtemp(join(tmpdir(),"world-candidate-")),pipeline=new WorldPipeline(),versions=new Versions(state,v=>pipeline.publish({type:"version",version:v}));
const modules=await Promise.all(input.modules.map(m=>versions.artifact(m.id,m.file,m.code)));
await versions.activate({version:1,tag:"candidate",commit:"candidate",title:"Candidate",requester:"check",modules},false);
for(let i=0;i<300;i++)pipeline.roster.accept({id:`check-${i}`,userId:`check-${i}`,displayName:`Neighbor${i}`,color:"#79D7CF",text:"hello",timestamp:Date.now()},Date.now());
const errors:string[]=[],samples:unknown[]=[],footprints:Footprint[]=[];
const evidence:Record<string,unknown>={status:"starting",profile:"production",viewport:[1920,1080],framebuffer:[160,90],probe:[192,108],probeId:input.probeId,samples,footprints,errors};
const save=()=>writeFile(join(directory,"evidence.json"),JSON.stringify(evidence,null,2),{mode:0o600}).catch(()=>{});
await save();
async function probe(page: Page) {
 const request=await page.evaluate(()=>++window.__worldStats.probeRequest);
 await page.waitForFunction(request=>window.__worldStats.probeCompleted>=request,request,{timeout:4000});
 const footprint=await page.evaluate(()=>({probePixels:window.__worldStats.moduleProbePixels,hdPixels:window.__worldStats.modulePixels,hdWidth:window.__worldStats.moduleWidth,hdHeight:window.__worldStats.moduleHeight}));
 const full:Footprint={...footprint,probeWidth:VISIBILITY_PROBE.width,probeHeight:VISIBILITY_PROBE.height,qualifies:footprint.hdPixels>=VISIBILITY_PROBE.minPixels&&footprint.hdWidth>=VISIBILITY_PROBE.minWidth&&footprint.hdHeight>=VISIBILITY_PROBE.minHeight};
 footprints.push(full);await save();return await page.evaluate(()=>window.__worldStats.frame);
}
let app:Awaited<ReturnType<typeof createWorldServer>>|undefined,browserServer:Awaited<ReturnType<typeof chromium.launchServer>>|undefined,browser:Awaited<ReturnType<typeof chromium.connect>>|undefined,page:Page|undefined;
try{
 app=await createWorldServer(pipeline,undefined,undefined,versions);await new Promise<void>(r=>app!.server.listen(0,"127.0.0.1",r));const port=(app.server.address() as {port:number}).port;
 browserServer=await chromium.launchServer({timeout:5000,headless:true,args:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});console.log(JSON.stringify({browserPid:browserServer.process().pid}));
 browser=await chromium.connect(browserServer.wsEndpoint());page=await browser.newPage({viewport:{width:1920,height:1080}});
 page.on("pageerror",e=>errors.push(e.message));page.on("console",e=>{if(e.type()==="error")errors.push(e.text());});
 evidence.status="loading";await save();
 await page.goto(`http://127.0.0.1:${port}/world?check=1&overlay=1&probe=${encodeURIComponent(input.probeId)}`);
 await page.waitForFunction(()=>window.__worldStats?.moduleCount>0||window.__worldStats?.moduleError,undefined,{timeout:6500});
 evidence.status="warming";await save();
 const first=await probe(page); // Shader compilation/readback is outside the 15s performance window.
 await page.waitForFunction(frame=>window.__worldStats.moduleError||window.__worldStats.frame>=frame+30,first,{timeout:3000});
 const second=await probe(page);
 await page.waitForFunction(frame=>window.__worldStats.moduleError||window.__worldStats.frame>=frame+3,second,{timeout:1200});
 const start=await page.evaluate(()=>({frame:window.__worldStats.frame,time:window.__worldStats.lastFrameAt}));
 evidence.status="sampling";evidence.start=start;await save();
 const sampleStart=performance.now(),hashes=new Set<number>();let lastPoll=start.time,maxPollGap=0;
 for(let sample=0;sample<15;sample++){
  await page.waitForTimeout(Math.max(0,sampleStart+(sample+1)*1000-performance.now()));
  const value=await page.evaluate(()=>new Promise<{frame:number;time:number;error:string;hash:number;lit:number;avg:number;renderer:string;visibility:string;trace:FrameEvidence[]}>(resolve=>requestAnimationFrame(()=>{
   const stats=window.__worldStats,gl=document.querySelector("canvas")!.getContext("webgl2")!,info=gl.getExtension("WEBGL_debug_renderer_info"),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,pixels=new Uint8Array(width*height*4);let hash=2166136261,lit=0;
   gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   for(let y=2;y<height;y+=5)for(let x=2;x<width;x+=5){const i=(y*width+x)*4;if(pixels[i]!+pixels[i+1]!+pixels[i+2]!>24)lit++;for(let k=0;k<4;k++)hash=Math.imul(hash^pixels[i+k]!,16777619);}
   const t=window.__worldFrameTrace!,trace=[];for(let n=0;n<t.size;n++){const i=(t.cursor-t.size+n+t.frames.length)%t.frames.length;trace.push({frame:t.frames[i]!,time:t.times[i]!,dt:t.intervals[i]!,cpu:t.cpu[i]!,render:t.render[i]!,probe:t.probe[i]!});}
   resolve({frame:stats.frame,time:stats.lastFrameAt,error:stats.moduleError,hash,lit,avg:stats.avgFps,renderer:info?String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)):"",visibility:document.visibilityState,trace});
  })));
  const {trace:checkpoint,...sampleValue}=value;evidence.frames=checkpoint;
  maxPollGap=Math.max(maxPollGap,value.time-lastPoll);lastPoll=value.time;samples.push(sampleValue);hashes.add(value.hash);evidence.maxPollGap=maxPollGap;await save();
  if(!/swiftshader/i.test(value.renderer))throw new Error("Candidate did not use SwiftShader.");
  if(errors.length||value.error)throw new Error(value.error||"Candidate console error.");if(!value.lit)throw new Error("Black canvas.");

 }
 const end=await page.evaluate(()=>({...window.__worldStats,time:window.__worldStats.lastFrameAt}));
 const trace=await page.evaluate(()=>{const t=window.__worldFrameTrace!;const result=[];for(let n=0;n<t.size;n++){const i=(t.cursor-t.size+n+t.frames.length)%t.frames.length;result.push({frame:t.frames[i]!,time:t.times[i]!,dt:t.intervals[i]!,cpu:t.cpu[i]!,render:t.render[i]!,probe:t.probe[i]!});}return result;}) as FrameEvidence[];
 const timing=frameVerdict(start,end,trace,hashes.size,[start.time,...(samples as {time:number}[]).map(s=>s.time)]);
 await probe(page); // Final visibility is measured after timing, not charged as candidate work.
 const visibility=visibilityVerdict(footprints);
 evidence.end=end;evidence.frames=trace;evidence.timing=timing;evidence.visibility=visibility;await save();
 if(!timing.ok)throw new Error(timing.reason);if(!visibility.ok)throw new Error(visibility.reason);
 evidence.status="passed";await save();
 await page.screenshot({path:join(directory,"canvas.png"),timeout:800}).catch(()=>{});
 console.log(JSON.stringify({...timing,samples:15,modulePixels:visibility.best?.hdPixels,visibility,citizens:end.citizenCount,hashes:hashes.size}));
}catch(error){evidence.status="failed";evidence.reason=error instanceof Error?error.message.slice(0,300):"Candidate check failed.";
 await save();
 if(page)try{const last=await Promise.race([page.evaluate(()=>({stats:window.__worldStats,frames:window.__worldFrameTrace?Array.from(window.__worldFrameTrace.intervals):[]})),new Promise<null>(r=>setTimeout(()=>r(null),600))]);evidence.lastStats=last;await page.screenshot({path:join(directory,"canvas.png"),timeout:800});}catch{}
 await save();console.log(JSON.stringify({ok:false,reason:evidence.reason}));process.exitCode=1;
}finally{await browser?.close();await browserServer?.close();app?.closeStreams();versions.close();if(app)await new Promise<void>(r=>app!.server.close(()=>r()));await rm(state,{recursive:true,force:true});}

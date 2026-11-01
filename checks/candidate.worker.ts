import {scaleVerdict} from "../world/shared/scale.js";
import {CHAT_PLAY as P} from "../world/shared/chat-play.js";
import {chatCommands} from "../server/runner/chat-play.js";
import {readFile,writeFile} from "node:fs/promises";
import {join,dirname} from "node:path";
import {chromium,type Page} from "@playwright/test";
import {createWorldServer} from "../server/http.js";
import {WorldPipeline} from "../server/pipeline.js";
import {Versions} from "../server/versions/index.js";
import {frameVerdict,summarizeFrames,visibilityVerdict,CANDIDATE_THRESHOLDS as C,type FrameEvidence} from "./candidate-policy.js";
import {VISIBILITY_PROBE,type Footprint} from "../world/engine/visibility.js";
import {GateError,candidateRejected,infrastructureFailed} from "../server/runner/verdict.js";
const path=process.argv[2]!,directory=dirname(path),input=JSON.parse(await readFile(path,"utf8")) as {modules:{id:string;file:string;code:string}[];probeId:string;commands?:string[];look?:"classic"|"new"};
const pipeline=new WorldPipeline(),versions=new Versions(join(directory,"runtime"),v=>pipeline.publish({type:"version",version:v}));
const modules=await Promise.all(input.modules.map(m=>versions.artifact(m.id,m.file,m.code))),retained=modules.filter(m=>m.id!==input.probeId);
await versions.activate({version:1,tag:"baseline",commit:"baseline",title:"Baseline",requester:"check",modules:retained},false);
for(let i=0;i<300;i++)pipeline.roster.accept({id:`check-${i}`,userId:`check-${i}`,displayName:`Neighbor${i}`,color:"#79D7CF",text:"hello",timestamp:Date.now()},Date.now());
const commands=chatCommands({description:(input.commands??[]).join(" "),steps:[],checks:[]}),sent:{text:string;userId:string;burst:number}[]=[];let burst=0;
const errors:string[]=[],footprints:Footprint[]=[],evidence:Record<string,unknown>={status:"starting",profile:"production",viewport:[1920,1080],framebuffer:[160,90],probe:[192,108],probeId:input.probeId,retained:retained.map(m=>m.id),look:input.look??"new",commands,sent,footprints,errors};
const save=()=>writeFile(join(directory,"evidence.json"),JSON.stringify(evidence,null,2),{mode:0o600});
await save();
async function probe(page:Page){const request=await page.evaluate(()=>++window.__worldStats.probeRequest);await page.waitForFunction(request=>window.__worldStats.probeCompleted>=request,request,{timeout:4000});const f=await page.evaluate(()=>({probePixels:window.__worldStats.moduleProbePixels,hdPixels:window.__worldStats.modulePixels,hdWidth:window.__worldStats.moduleWidth,hdHeight:window.__worldStats.moduleHeight}));const height=await page.evaluate(()=>window.__worldStats.moduleWorldHeight);evidence.moduleWorldHeight=height;const scaleError=scaleVerdict(height);if(scaleError)throw new GateError(candidateRejected(scaleError));footprints.push({...f,probeWidth:VISIBILITY_PROBE.width,probeHeight:VISIBILITY_PROBE.height,qualifies:f.hdPixels>=VISIBILITY_PROBE.minPixels&&f.hdWidth>=VISIBILITY_PROBE.minWidth&&f.hdHeight>=VISIBILITY_PROBE.minHeight});await save();}
async function frames(page:Page){return page.evaluate(()=>{const t=window.__worldFrameTrace!,result=[];for(let n=0;n<t.size;n++){const i=(t.cursor-t.size+n+t.frames.length)%t.frames.length;result.push({frame:t.frames[i]!,time:t.times[i]!,dt:t.intervals[i]!,cpu:t.cpu[i]!,render:t.render[i]!,module:t.module[i]!,probe:t.probe[i]!});}return result;});}
async function sendCommands(page:Page){
 if(!commands.length)return;const currentBurst=++burst;
 for(const [index,text] of commands.entries()){
  if(index)await page.waitForTimeout(P.commandSpacingMs);
  for(let i=0;i<P.players;i++){const userId=`check-${i}`,result=pipeline.chat({id:`command-${currentBurst}-${index}-${i}`,userId,displayName:`Neighbor${i}`,color:"#79D7CF",text});if(!result.accepted)throw new Error(`Synthetic chat rejected: ${result.reason}`);sent.push({text,userId,burst:currentBurst});}
 }
 await page.waitForFunction(count=>window.__worldStats.moduleChats>=count||!!window.__worldStats.moduleError,sent.length,{timeout:3000});
 const error=await page.evaluate(()=>window.__worldStats.moduleError);if(error)throw new GateError(candidateRejected(error));await save();
}
async function warm(page:Page,count:number,stage="candidate"){const frame=await page.evaluate(()=>window.__worldStats.frame);await page.waitForFunction(target=>window.__worldStats.frame>=target||!!window.__worldStats.moduleError,frame+count,{timeout:C.warmupTimeoutMs});const error=await page.evaluate(()=>window.__worldStats.moduleError);if(error)throw new GateError(stage==="baseline"?infrastructureFailed(error):candidateRejected(error));}
async function sample(page:Page,seconds:number,stage:string){
 const start=await page.evaluate(()=>({frame:window.__worldStats.frame,time:window.__worldStats.lastFrameAt})),samples:unknown[]=[],hashes=new Set<number>();let trace:FrameEvidence[]=[];
 const begin=performance.now();evidence.status=stage;await save();
 for(let i=0;i<seconds;i++){

  await page.waitForTimeout(Math.max(0,begin+(i+1)*1000-performance.now()));
  const value=await page.evaluate(()=>new Promise<{frame:number;time:number;error:string;hash:number;lit:number;avg:number;renderer:string}>(resolve=>requestAnimationFrame(()=>{const s=window.__worldStats,gl=document.querySelector("canvas")!.getContext("webgl2")!,info=gl.getExtension("WEBGL_debug_renderer_info"),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,pixels=new Uint8Array(w*h*4);let hash=2166136261,lit=0;gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);for(let y=2;y<h;y+=5)for(let x=2;x<w;x+=5){const n=(y*w+x)*4;if(pixels[n]!+pixels[n+1]!+pixels[n+2]!>24)lit++;for(let k=0;k<4;k++)hash=Math.imul(hash^pixels[n+k]!,16777619);}resolve({frame:s.frame,time:s.lastFrameAt,error:s.moduleError,hash,lit,avg:s.avgFps,renderer:info?String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)):""});})));
  samples.push(value);hashes.add(value.hash);trace=await frames(page);evidence.currentSlice={stage,start,samples};await save();
  if(!/swiftshader/i.test(value.renderer))throw new Error("Candidate did not use SwiftShader.");
  if(errors.length)throw new Error("Checker console error.");if(value.error)throw new GateError(candidateRejected(value.error));
  if(!value.lit)throw new GateError(stage==="baseline"?infrastructureFailed("Baseline black canvas."):candidateRejected("Black canvas."));
 }
 const end=await page.evaluate(()=>({...window.__worldStats,time:window.__worldStats.lastFrameAt}));trace=await frames(page);
 const summary=summarizeFrames(start,end,trace,[start.time,...(samples as {time:number}[]).map(s=>s.time)]);evidence[stage]={start,end,samples,frames:trace,summary,hashes:hashes.size};await save();return {summary,hashes:hashes.size,pixelHashes:[...hashes],trace};
}
let app:Awaited<ReturnType<typeof createWorldServer>>|undefined,browserServer:Awaited<ReturnType<typeof chromium.launchServer>>|undefined,browser:Awaited<ReturnType<typeof chromium.connect>>|undefined,page:Page|undefined;
try{
 app=await createWorldServer(pipeline,undefined,undefined,versions,{worldLook:input.look??"new",live:false,async fault(){}});await new Promise<void>(r=>app!.server.listen(0,"127.0.0.1",r));const port=(app.server.address() as {port:number}).port;
 browserServer=await chromium.launchServer({timeout:8000,headless:true,args:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});console.log(JSON.stringify({browserPid:browserServer.process().pid}));browser=await chromium.connect(browserServer.wsEndpoint());page=await browser.newPage({viewport:{width:1920,height:1080}});
 page.on("pageerror",e=>errors.push(e.message));page.on("console",e=>{if(e.type()==="error")errors.push(e.text());});
 evidence.status="loading";await save();await page.goto(`http://127.0.0.1:${port}/world?check=1&overlay=1&time=day&probe=${encodeURIComponent(input.probeId)}`);
 await page.waitForFunction(()=>window.__worldStats?.moduleVersion===1,undefined,{timeout:8000});await page.waitForSelector('canvas[data-ready="true"]');await warm(page,C.warmupFrames,"baseline");
 // Same page, citizen roster, renderer and retained instances. Only the candidate is added.
 await versions.activate({version:2,tag:"candidate",commit:"candidate",title:"Candidate",requester:"check",modules},false);
 await page.waitForFunction(()=>window.__worldStats.moduleVersion===2||!!window.__worldStats.moduleError,undefined,{timeout:6500});const error=await page.evaluate(()=>window.__worldStats.moduleError);if(error)throw new GateError(candidateRejected(error));
 const initialFocuses=await page.evaluate(()=>window.__worldStats.moduleFocuses);
 await sendCommands(page);await warm(page,C.candidateWarmupFrames);
 // Visibility rejects happen before the expensive timing window.
 if(commands.length)await page.waitForTimeout(P.focusDuration*1000);
 await probe(page);await page.waitForTimeout(200);await probe(page);
 if(footprints.every(f=>!f.qualifies))throw new GateError(candidateRejected(visibilityVerdict(footprints).reason!));
 await page.evaluate(()=>{window.__worldStats.measureCameraLocked=true;});evidence.costCamera="locked pose; alternating owned roots on/off with hooks and chat active";
 const costStart=await page.evaluate(()=>({frame:window.__worldStats.frame,time:window.__worldStats.lastFrameAt}));
 const pairs:{baseline:Awaited<ReturnType<typeof sample>>;candidate:Awaited<ReturnType<typeof sample>>}[]=[],slices:unknown[]=[];
 evidence.slices=slices;
 for(let pair=0;pair<C.slicePairs;pair++){
  if(commands.length&&pair>0&&pair%Math.ceil(C.slicePairs/P.bursts)===0)await sendCommands(page);
  const measured={} as {baseline:Awaited<ReturnType<typeof sample>>;candidate:Awaited<ReturnType<typeof sample>>};
  for(const visible of (pair%2?[true,false]:[false,true])){
   await page.evaluate(visible=>{window.__worldStats.measureCandidateVisible=visible;},visible);
   // Exclude the transition interval; shader compilation was covered by warmup.
   await warm(page,2);
   const stage=visible?"candidate":"baseline",slice=await sample(page,C.sliceSeconds,stage);measured[stage]=slice;slices.push({pair,visible,summary:slice.summary});
  }
  pairs.push(measured);
 }
 await page.evaluate(()=>{window.__worldStats.measureCandidateVisible=true;window.__worldStats.measureCameraLocked=false;});
 if(commands.length)await page.waitForTimeout(P.focusDuration*1000);
 await probe(page);
 const average=(key:"baseline"|"candidate")=>{const samples=pairs.map(p=>p[key].summary),fps=samples.reduce((n,s)=>n+s.fps,0)/samples.length;return {...samples[0]!,fps,frames:samples.reduce((n,s)=>n+s.frames,0),maxFrameGap:Math.max(...samples.map(s=>s.maxFrameGap)),consecutiveLongFrames:Math.max(...samples.map(s=>s.consecutiveLongFrames)),moduleP95Ms:Math.max(...samples.map(s=>s.moduleP95Ms)),renderP95Ms:Math.max(...samples.map(s=>s.renderP95Ms))};};
 const baseline={summary:average("baseline")},candidate={summary:average("candidate"),trace:await frames(page)};
 const costEnd=await page.evaluate(()=>({...window.__worldStats,time:window.__worldStats.lastFrameAt}));
 const whole=summarizeFrames(costStart,costEnd,candidate.trace);candidate.summary.consecutiveLongFrames=whole.consecutiveLongFrames;
 evidence.baseline=baseline;evidence.candidate=candidate;evidence.window=whole;
 const timing=frameVerdict(baseline.summary,candidate.summary,new Set(pairs.flatMap(p=>p.candidate.pixelHashes)).size,pairs.map(p=>({baseline:p.baseline.summary,candidate:p.candidate.summary})));
 const commandResult=await page.evaluate(()=>({calls:window.__worldStats.moduleChats,focuses:window.__worldStats.moduleFocuses}));evidence.commandResult=commandResult;
 if(commands.length&&commandResult.focuses<=initialFocuses)throw new GateError(candidateRejected("Chat commands produced no camera.focus result; focus the visible play outcome or winning citizen."));
 evidence.playLabels=await page.evaluate(players=>{const result=[];for(let i=0;i<players;i++){const id=`check-${i}`,label=document.querySelector<HTMLElement>(`.citizen-label[data-user-id="${id}"]`);if(label&&!label.hidden)result.push({id,name:label.querySelector(".citizen-name")?.textContent,mode:label.dataset.mode});}return result;},P.players);
 const visibility=visibilityVerdict(footprints);Object.assign(evidence,{end:await page.evaluate(()=>window.__worldStats),frames:candidate.trace,timing,visibility});await save();
 if(!timing.ok)throw new GateError(candidateRejected(timing.reason!));if(!visibility.ok)throw new GateError(candidateRejected(visibility.reason!));
 evidence.status="passed";await save();await page.screenshot({path:join(directory,"canvas.png"),timeout:1000}).catch(()=>{});console.log(JSON.stringify({...timing,samples:C.sampleSeconds,slicePairs:C.slicePairs,modulePixels:visibility.best?.hdPixels,visibility,citizens:300}));
}catch(error){evidence.status="failed";evidence.reason=error instanceof Error?error.message.slice(0,500):"Candidate check failed.";await save().catch(()=>{});if(page){const last=await Promise.race([Promise.all([frames(page),page.evaluate(()=>window.__worldStats)]).then(([frames,stats])=>({frames,stats})),new Promise<null>(r=>setTimeout(()=>r(null),600))]).catch(()=>null);evidence.failure=last;await save().catch(()=>{});await page.screenshot({path:join(directory,"canvas.png"),timeout:600}).catch(()=>{});}console.log(JSON.stringify(error instanceof GateError?error.verdict:infrastructureFailed(String(evidence.reason))));process.exitCode=1;
}finally{await browser?.close();await browserServer?.close();app?.closeStreams();versions.close();if(app)await new Promise<void>(r=>app!.server.close(()=>r()));}

import type {ModelName} from "../world/shared/model-kit.js";
import {COST_MATERIAL_POLICY} from "../world/engine/measurement-materials.js";
import sharp from "sharp";
import {scaleVerdict} from "../world/shared/scale.js";
import {CHAT_PLAY as P} from "../world/shared/chat-play.js";
import {chatCommands} from "../server/runner/chat-play.js";
import {readFile,writeFile} from "node:fs/promises";
import {join,dirname} from "node:path";
import {chromium,type Page,type Browser} from "@playwright/test";
import {createWorldServer} from "../server/http.js";
import {WorldPipeline} from "../server/pipeline.js";
import {Versions} from "../server/versions/index.js";
import {frameVerdict,summarizeFrames,visibilityVerdict,percentile,CANDIDATE_THRESHOLDS as C} from "./candidate-policy.js";
import {VISIBILITY_PROBE,type Footprint} from "../world/engine/visibility.js";
import {GateError,candidateRejected,infrastructureFailed,worldHealth} from "../server/runner/verdict.js";
const path=process.argv[2]!,directory=dirname(path),input=JSON.parse(await readFile(path,"utf8")) as {modules:{id:string;file:string;code:string;modelKinds?:readonly ModelName[]}[];probeId:string;commands:string[];look:"classic"|"new";browserEndpoint:string;browserPort:number};
const pipeline=new WorldPipeline(),versions=new Versions(join(directory,"runtime"),v=>pipeline.publish({type:"version",version:v}));
const modules=await Promise.all(input.modules.map(m=>versions.artifact(m.id,m.file,m.code,m.modelKinds))),retained=modules.filter(m=>m.id!==input.probeId);
await versions.activate({version:1,tag:"baseline",commit:"baseline",title:"Baseline",requester:"check",modules:retained},false);
for(let i=0;i<300;i++)pipeline.roster.accept({id:`check-${i}`,userId:`check-${i}`,displayName:`Neighbor${i}`,color:"#79D7CF",text:"hello",timestamp:Date.now()},Date.now());
const commands=chatCommands({description:input.commands.join(" "),steps:[],checks:[]}),sent:{text:string;userId:string;burst:number}[]=[];let burst=0;
const errors:string[]=[],footprints:Footprint[]=[],evidence:Record<string,unknown>={status:"starting",profile:"production",viewport:[1920,1080],framebuffer:[160,90],probe:[VISIBILITY_PROBE.width,VISIBILITY_PROBE.height],measurement:"fixed main + classic-cost shadows; full live composer for visibility",costMaterials:COST_MATERIAL_POLICY,probeId:input.probeId,retained:retained.map(m=>m.id),look:input.look,commands,sent,footprints,errors};
const canvasSamples:{hash:number;lit:number}[]=[];evidence.canvasSamples=canvasSamples;
const save=()=>writeFile(join(directory,"evidence.json"),JSON.stringify(evidence,null,2),{mode:0o600});
await save();
async function probe(page:Page,cold=false){const started=performance.now();if(cold){evidence.status="native visibility warmup";await save();}const request=await page.evaluate(()=>++window.__worldStats.probeRequest);await page.waitForFunction(request=>window.__worldStats.probeCompleted>=request||!!window.__worldStats.moduleError,request,{timeout:cold?C.watchdogMs:C.warmupTimeoutMs,polling:50});if(cold)evidence.nativeWarmupMs=performance.now()-started;await requireHealthy(page);const f=await page.evaluate(()=>({probePixels:window.__worldStats.moduleProbePixels,hdPixels:window.__worldStats.modulePixels,hdWidth:window.__worldStats.moduleWidth,hdHeight:window.__worldStats.moduleHeight}));const height=await page.evaluate(()=>window.__worldStats.moduleWorldHeight);evidence.moduleWorldHeight=height;const scaleError=scaleVerdict(height);if(scaleError)throw new GateError(candidateRejected(scaleError));footprints.push({...f,probeWidth:VISIBILITY_PROBE.width,probeHeight:VISIBILITY_PROBE.height,qualifies:f.hdPixels>=VISIBILITY_PROBE.minPixels&&f.hdWidth>=VISIBILITY_PROBE.minWidth&&f.hdHeight>=VISIBILITY_PROBE.minHeight}); const pixels=await page.evaluate(()=>({frame:window.__worldStats.frame,time:window.__worldStats.lastFrameAt,error:window.__worldStats.moduleError,hash:window.__worldStats.probeHash,lit:window.__worldStats.probeLit,avg:window.__worldStats.avgFps}));
 canvasSamples.push(pixels);if(!pixels.lit)throw new GateError(candidateRejected("Black canvas."));
const fullPixels=await page.evaluate(()=>Array.from(window.__worldProbePixels??[]));if(fullPixels.length)await sharp(Buffer.from(fullPixels),{raw:{width:VISIBILITY_PROBE.width,height:VISIBILITY_PROBE.height,channels:4}}).flip().png().toFile(join(directory,"full-look-probe.png"));
await save();}
async function frames(page:Page){return page.evaluate(()=>{const t=window.__worldFrameTrace!,result=[];for(let n=0;n<t.size;n++){const i=(t.cursor-t.size+n+t.frames.length)%t.frames.length;result.push({frame:t.frames[i]!,time:t.times[i]!,dt:t.intervals[i]!,cpu:t.cpu[i]!,render:t.render[i]!,module:t.module[i]!,probe:t.probe[i]!});}return result;});}
async function sendCommands(page:Page){
 if(!commands.length)return;const currentBurst=++burst;
 for(const [index,text] of commands.entries()){
  if(index)await waitSim(page,P.commandSpacingMs/1000);
  for(let i=0;i<P.players;i++){const userId=`check-${i}`,result=pipeline.chat({id:`command-${currentBurst}-${index}-${i}`,userId,displayName:`Neighbor${i}`,color:"#79D7CF",text});if(!result.accepted)throw new Error(`Synthetic chat rejected: ${result.reason}`);sent.push({text,userId,burst:currentBurst});}
 }
 await page.waitForFunction(count=>window.__worldStats.moduleChats>=count||!!window.__worldStats.moduleError,sent.length,{timeout:3000});
 await requireHealthy(page);await save();
}
async function warm(page:Page,count:number,stage="candidate"){const frame=await page.evaluate(()=>window.__worldStats.frame);await page.waitForFunction(target=>window.__worldStats.frame>=target||!!window.__worldStats.moduleError,frame+count,{timeout:C.warmupTimeoutMs});await requireHealthy(page,stage==="baseline");}
async function requireHealthy(page:Page,baseline=false){const failure=worldHealth(await page.evaluate(()=>({moduleError:window.__worldStats?.moduleError,moduleLoadError:window.__worldStats?.moduleLoadError,bootError:window.__worldBootError})),baseline);if(failure)throw new GateError(failure);}
async function waitSim(page:Page,seconds:number){const start=await page.evaluate(()=>window.__worldStats.simTime);await page.waitForFunction(target=>window.__worldStats.simTime>=target||!!window.__worldStats.moduleError,start+seconds,{polling:50,timeout:C.warmupTimeoutMs});await requireHealthy(page);}
async function sample(page:Page,count:number,stage:string){
 const start=await page.evaluate(()=>({frame:window.__worldStats.frame,time:window.__worldStats.lastFrameAt,simTime:window.__worldStats.simTime})),target=start.frame+1+count;
 evidence.status=stage;await save();
 await page.waitForFunction(target=>window.__worldStats.frame>=target||!!window.__worldStats.moduleError,target,{polling:50,timeout:C.warmupTimeoutMs});
 const end=await page.evaluate(()=>({...window.__worldStats,time:window.__worldStats.lastFrameAt})),trace=await frames(page);
 if(errors.length)throw new Error("Checker console error.");await requireHealthy(page);
 const first=trace.find(f=>f.frame===start.frame+1),last=trace.find(f=>f.frame===target);if(!first||!last)throw new Error("Missing measurement frames.");
 const summary=summarizeFrames({frame:first.frame,time:first.time},{frame:last.frame,time:last.time,avgFps:end.avgFps},trace,[]);
 if(summary.frames<C.minimumSliceFrames)throw new Error("Too few rendered measurement frames.");
 evidence[stage]={start,end,summary};await save();return {summary,trace};
}
let app:Awaited<ReturnType<typeof createWorldServer>>|undefined,browser:Browser|undefined,page:Page|undefined;
try{
 app=await createWorldServer(pipeline,undefined,undefined,versions,{worldLook:input.look,live:false,async fault(){}});await new Promise<void>(r=>app!.server.listen(input.browserPort,"127.0.0.1",r));const port=(app.server.address() as {port:number}).port;
 browser=await chromium.connectOverCDP(input.browserEndpoint);const context=browser.contexts()[0];if(!context)throw new Error('Warm gate context is unavailable.');page=await context.newPage();await page.setViewportSize({width:1920,height:1080});
 await page.bringToFront();const identity=await page.context().newCDPSession(page);evidence.targetId=(await identity.send("Target.getTargetInfo")).targetInfo.targetId;await identity.detach();
 page.on("pageerror",e=>errors.push(e.message));page.on("console",e=>{if(e.type()==="error")errors.push(e.text());});
 const fresh=page.url()==='about:blank'&&await page.evaluate(()=>!document.hidden&&typeof window.__worldStats==='undefined');if(!fresh)throw new Error('Candidate page is not a fresh visible document.');evidence.freshPage=true;
 evidence.status="loading";await save();await page.goto(`http://127.0.0.1:${port}/world?check=1&overlay=1&time=day&probe=${encodeURIComponent(input.probeId)}`);

 await page.waitForFunction(()=>window.__worldStats?.moduleVersion===1||!!window.__worldStats?.moduleError||!!window.__worldBootError,undefined,{timeout:8000,polling:100});await requireHealthy(page,true);await page.waitForSelector('canvas[data-ready="true"]');
 const rendererName=await page.evaluate(()=>{const gl=document.querySelector("canvas")!.getContext("webgl2")!,info=gl.getExtension("WEBGL_debug_renderer_info");return info?String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)):"";});if(!/swiftshader/i.test(rendererName))throw new Error("Candidate did not use SwiftShader.");evidence.renderer=rendererName;evidence.shadowMap=await page.locator("canvas").getAttribute("data-shadow");evidence.costPipeline=await page.locator("canvas").getAttribute("data-pipeline");evidence.visibilityPipeline=await page.locator("canvas").getAttribute("data-probe-pipeline");evidence.costTargets=await page.locator("canvas").getAttribute("data-targets");evidence.visibilityTargets=await page.locator("canvas").getAttribute("data-probe-targets");
 await warm(page,C.warmupFrames,"baseline");
 // Same page, citizen roster, renderer and retained instances. Only the candidate is added.
 await versions.activate({version:2,tag:"candidate",commit:"candidate",title:"Candidate",requester:"check",modules},false);
 await page.waitForFunction(()=>window.__worldStats.moduleVersion===2||!!window.__worldStats.moduleError,undefined,{timeout:6500});await requireHealthy(page);
 const initialFocuses=await page.evaluate(()=>window.__worldStats.moduleFocuses);
 await sendCommands(page);await warm(page,C.candidateWarmupFrames);
 // The first full-look render is both cold shader startup and the first qualified
 // visibility probe. Do not throw away its pixels and redraw the same probe.
 // Cold compilation remains bounded by the whole-worker watchdog.
 if(commands.length)await waitSim(page,P.focusDuration);
 await probe(page,true);await waitSim(page,.2);await probe(page);
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
   // Drop the crossing interval in the summary instead of adding idle frames between slices.
   const stage=visible?"candidate":"baseline",slice=await sample(page,C.sliceFrames,stage);measured[stage]=slice;slices.push({pair,visible,summary:slice.summary});
  }
  pairs.push(measured);
 }
 await page.evaluate(()=>{window.__worldStats.measureCandidateVisible=true;window.__worldStats.measureCameraLocked=false;});
 if(commands.length)await waitSim(page,P.focusDuration);
 await probe(page);
 const aggregate=(key:"baseline"|"candidate")=>{const samples=pairs.map(p=>p[key].summary),fps=percentile(samples.map(s=>s.fps),.5);return {...samples[0]!,fps,avgFps:samples.reduce((n,s)=>n+s.frames,0)/samples.reduce((n,s)=>n+s.frames/s.rawFps,0),frames:samples.reduce((n,s)=>n+s.frames,0),maxFrameGap:Math.max(...samples.map(s=>s.maxFrameGap)),consecutiveLongFrames:Math.max(...samples.map(s=>s.consecutiveLongFrames)),moduleP95Ms:Math.max(...samples.map(s=>s.moduleP95Ms)),renderP95Ms:Math.max(...samples.map(s=>s.renderP95Ms))};};
 const baseline={summary:aggregate("baseline")},candidate={summary:aggregate("candidate"),trace:await frames(page)};
 const costEnd=await page.evaluate(()=>({...window.__worldStats,time:window.__worldStats.lastFrameAt}));
 const whole=summarizeFrames(costStart,costEnd,candidate.trace);candidate.summary.consecutiveLongFrames=whole.consecutiveLongFrames;
 evidence.baseline=baseline;evidence.candidate=candidate;evidence.window=whole;
 const timing=frameVerdict(baseline.summary,candidate.summary,new Set(canvasSamples.map(s=>s.hash)).size,pairs.map(p=>({baseline:p.baseline.summary,candidate:p.candidate.summary})));
 const commandResult=await page.evaluate(()=>({calls:window.__worldStats.moduleChats,focuses:window.__worldStats.moduleFocuses}));evidence.commandResult=commandResult;
 if(commands.length&&commandResult.focuses<=initialFocuses)throw new GateError(candidateRejected("Chat commands produced no camera.focus result; focus the visible play outcome or winning citizen."));
 evidence.playLabels=await page.evaluate(players=>{const result=[];for(let i=0;i<players;i++){const id=`check-${i}`,label=document.querySelector<HTMLElement>(`.citizen-label[data-user-id="${id}"]`);if(label&&!label.hidden)result.push({id,name:label.querySelector(".citizen-name")?.textContent,mode:label.dataset.mode});}return result;},P.players);
 const visibility=visibilityVerdict(footprints);Object.assign(evidence,{end:await page.evaluate(()=>window.__worldStats),frames:candidate.trace,timing,visibility});await save();
 if(!timing.ok)throw new GateError(candidateRejected(timing.reason!));if(!visibility.ok)throw new GateError(candidateRejected(visibility.reason!));
 await requireHealthy(page);if(errors.length)throw new Error("Checker console error.");
 evidence.status="passed";await save();console.log(JSON.stringify({...timing,nativeWarmupMs:evidence.nativeWarmupMs,framesPerSlice:C.sliceFrames,slicePairs:C.slicePairs,modulePixels:visibility.best?.hdPixels,visibility,citizens:300}));await page.screenshot({path:join(directory,"canvas.png"),timeout:1000}).catch(()=>{});
}catch(error){evidence.status="failed";evidence.reason=error instanceof Error?error.message.slice(0,500):"Candidate check failed.";await save().catch(()=>{});if(page){const last=await Promise.race([Promise.all([frames(page),page.evaluate(()=>window.__worldStats)]).then(([frames,stats])=>({frames,stats})),new Promise<null>(r=>setTimeout(()=>r(null),600))]).catch(()=>null);evidence.failure=last;await save().catch(()=>{});await page.screenshot({path:join(directory,"canvas.png"),timeout:600}).catch(()=>{});}console.log(JSON.stringify(error instanceof GateError?error.verdict:infrastructureFailed(String(evidence.reason))));process.exitCode=1;
}finally{await browser?.close();app?.closeStreams();versions.close();if(app)await new Promise<void>(r=>app!.server.close(()=>r()));}

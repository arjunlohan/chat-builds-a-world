import {fixtureServer,delay} from "./fixture-server.js";
import {parseArgs} from "node:util";
import {mkdir,writeFile,cp} from "node:fs/promises";
import {join,resolve,dirname} from "node:path";
import WebSocket from "ws";
import {git} from "../server/runner/git.js";
import {runBounded} from "../server/runtime/process.js";
import {launchWorldPage,measureFps} from "./browser.js";
import type {CitizenState} from "../server/contracts.js";
const {values}=parseArgs({options:{seconds:{type:"string",default:"7200"},interval:{type:"string",default:"900"},sample:{type:"string",default:"10"},output:{type:"string",default:"state/soak.json"},ref:{type:"string",default:"HEAD"}}});
const seconds=Number(values.seconds),interval=Number(values.interval),sampleSeconds=Number(values.sample);
if(!Number.isInteger(seconds)||seconds<10||seconds>86400||interval<10||sampleSeconds<1||sampleSeconds>60)throw new Error("Use 10..86400 seconds, interval >=10 and a 1..60 second FPS sample");
const source=process.cwd(),fixture=await fixtureServer(source,{prefix:"world-soak-",ref:values.ref}),{root,port,base,env}=fixture,output=resolve(values.output);
interface Heap {heapUsed:number;heapTotal:number;rss:number;external:number}
interface Sample {minute:number;at:string;fps:number;avgFps:number;serverHeap:Heap;serverRawHeap:Heap;browserHeap:{usedSize:number;totalSize:number};browserRawHeap:{usedSize:number;totalSize:number};dom:number;citizens:number;frame:number}
const report={status:"starting",startedAt:new Date().toISOString(),pid:process.pid,serverPid:0,root,port,commit:"",renderer:"",samples:[] as Sample[],health:[] as {at:string;heapUsed:number;fps:number;citizens:number}[],errors:[] as string[],sim:[] as {code:number|null;output:string}[],worktrees:0,finishedAt:""};
await mkdir(dirname(output),{recursive:true});const save=()=>writeFile(output,JSON.stringify(report,null,2),{mode:0o600});
let world:Awaited<ReturnType<typeof launchWorldPage>>|undefined,inspector:WebSocket|undefined;
let aborted=false;for(const signal of ["SIGINT","SIGTERM"] as const)process.once(signal,()=>{aborted=true;});
try{
 report.commit=await git(root,"rev-parse","HEAD");const started=await fixture.start(true);report.serverPid=started.process.pid??0;const inspectorUrl=started.inspectorUrl;await save();
 inspector=new WebSocket(inspectorUrl);await new Promise<void>((r,j)=>{inspector!.once("open",r);inspector!.once("error",j);});let serial=0;
 const pending=new Map<number,{resolve:(value:unknown)=>void;reject:(error:Error)=>void}>();
 inspector.on("message",raw=>{const value=JSON.parse(String(raw)) as {id?:number;result:unknown;error?:{message:string}};if(value.id){const callback=pending.get(value.id);if(callback){pending.delete(value.id);if(value.error)callback.reject(new Error(value.error.message));else callback.resolve(value.result);}}});
 const command=<T,>(method:string,params:object={})=>new Promise<T>((r,j)=>{const id=++serial;pending.set(id,{resolve:value=>r(value as T),reject:j});inspector!.send(JSON.stringify({id,method,params}));});
 const memory=async()=> (await command<{result:{value:Heap}}>("Runtime.evaluate",{expression:"process.memoryUsage()",returnByValue:true})).result.value;
 world=await launchWorldPage(base,"overlay=1");const {page,gpu,errors}=world;report.errors=errors;report.renderer=gpu;if(/swiftshader|llvmpipe|software|unknown/i.test(gpu))throw new Error("Soak needs a physical GPU");
 async function sim(crowdOnly=false){const result=await runBounded({bin:"pnpm",args:["sim",...(crowdOnly?["--crowd-only"]:[])],cwd:root,env,timeoutMs:180000,maxBytes:65536});report.sim.push({code:result.code,output:result.output});if(result.code!==0||result.error){const state=await(await fetch(base+"/api/rounds")).json();await writeFile(output.replace(/\.json$/,"-round-failure.json"),JSON.stringify(state,null,2));await cp(join(root,"state/checks"),output.replace(/\.json$/,"-checks"),{recursive:true}).catch(()=>{});throw new Error("pnpm sim failed: "+(result.error??result.output.slice(-300)));}}
 // Suspend this client only during the independent SwiftShader gate. Resume it
 // for the real hot-swap/receipt before the runner's eight-second deadline.
 const lifecycle=await page.context().newCDPSession(page);await lifecycle.send("Page.setWebLifecycleState",{state:"frozen"});
 let simFinished=false;const initial=sim().finally(()=>{simFinished=true;});void initial.catch(()=>{});
 try{while(!simFinished){const state=await(await fetch(base+"/api/world")).json() as {version:unknown};if(state.version)break;await delay(100);}}finally{await lifecycle.send("Page.setWebLifecycleState",{state:"active"});await lifecycle.detach();}
 await initial;let sequence=0;
 const snapshot=async()=>await(await fetch(base+"/api/world")).json() as {citizens:CitizenState[]};
 const post=async(c:Pick<CitizenState,"id"|"displayName"|"color">)=>{const response=await fetch(base+"/sim/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:`pulse-${sequence++}`,userId:c.id,displayName:c.displayName,color:c.color,text:"hello island"})});if(!response.ok)throw new Error("Soak admission failed");};
 async function replenish(){const {citizens}=await snapshot();for(let i=citizens.length;i<300;i++){await post({id:`soak-guest-${sequence}`,displayName:`Guest${sequence}`,color:"#DCA777"});if(i%80===0)await delay(1100);}}
 await replenish();await page.waitForFunction(()=>window.__worldStats.citizenCount===300);await delay(5000);const cdp=await page.context().newCDPSession(page),start=Date.now();report.status="running";await save();
 async function sample(minute:number){const serverRawHeap=await memory();await command("HeapProfiler.collectGarbage");const serverHeap=await memory(),browserRawHeap=await cdp.send("Runtime.getHeapUsage");await cdp.send("HeapProfiler.collectGarbage");const browserHeap=await cdp.send("Runtime.getHeapUsage"),timing=await measureFps(page,sampleSeconds*1000),dom=await page.locator("*").count();report.samples.push({minute,at:new Date().toISOString(),fps:timing.fps,avgFps:timing.avgFps,serverHeap,serverRawHeap,browserHeap,browserRawHeap,dom,citizens:timing.stats.citizenCount,frame:timing.stats.frame});await save();console.log(JSON.stringify(report.samples.at(-1)));}
 await sample(0);let next=interval,lastHeartbeat=Date.now(),lastHealth=Date.now();
 while(!aborted&&(Date.now()-start)/1000<seconds){
  const elapsed=(Date.now()-start)/1000;if(elapsed>=next){await sim(true);await replenish();await page.waitForTimeout(1500);await sample(Math.round(next/60));next+=interval;}
  if(Date.now()-lastHeartbeat>=60000){lastHeartbeat=Date.now();for(const citizen of (await snapshot()).citizens.filter(c=>!c.entry)){await post(citizen);if(sequence%80===0)await delay(1100);}await replenish();}
  if(Date.now()-lastHealth>=60000){lastHealth=Date.now();const heap=await memory(),stats=await page.evaluate(()=>window.__worldStats);const value={at:new Date().toISOString(),heapUsed:heap.heapUsed,fps:stats.avgFps,citizens:stats.citizenCount};report.health.push(value);await save();console.log(JSON.stringify({health:value}));}
  await delay(1000);
 }
 await sample(Math.round(seconds/60));report.status=aborted?"cancelled":"complete";report.finishedAt=new Date().toISOString();report.worktrees=(await git(root,"worktree","list","--porcelain")).split("worktree ").length-1;await page.screenshot({path:output.replace(/\.json$/,".png")});await save();
 if(aborted||report.errors.length||report.worktrees!==1||report.samples.some(s=>s.fps<50||s.citizens!==300))process.exitCode=1;
}catch(error){report.status="failed";report.errors.push(error instanceof Error?error.message:"Soak failed");await save();process.exitCode=1;}finally{inspector?.close();await world?.browser.close();await fixture.dispose();}

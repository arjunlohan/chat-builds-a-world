import { spawn } from "node:child_process";
import { mkdtemp, symlink, appendFile, mkdir, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { chromium } from "@playwright/test";
import { git } from "../server/runner/git.js";

// Disposable clone, explicit offline adapters, physical GPU. No dotenv or provider credentials.
const argument=(name:string)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const seconds=Number(argument("seconds")??600);if(!Number.isInteger(seconds)||seconds<10||seconds>3600)throw new Error("Use 10..3600 seconds");
const source=process.cwd(),root=await mkdtemp(join(tmpdir(),"world-soak-"));
const output=resolve(argument("output")??"state/soak.json"),ref=argument("ref")??"HEAD";
const socket=createServer();await new Promise<void>(r=>socket.listen(0,"127.0.0.1",r));const port=(socket.address() as {port:number}).port;await new Promise<void>(r=>socket.close(()=>r()));
const env={PATH:process.env.PATH??"/usr/bin:/bin",HOME:process.env.HOME??"",PORT:String(port),SIMULATION_ALLOWED:"1",SIMULATION_MODE:"fixture"};
let server:ReturnType<typeof spawn>|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try{
 await git(source,"clone","--quiet","--no-hardlinks",source,root);await git(root,"switch","-C","master",ref);
 await symlink(join(source,"node_modules"),join(root,"node_modules"));await appendFile(join(root,".git/info/exclude"),"\nnode_modules\n");
 server=spawn(process.execPath,["--import","tsx","server/index.ts"],{cwd:root,env,detached:true,stdio:"ignore"});
 const base=`http://127.0.0.1:${port}`;let ready=false;
 for(let i=0;i<100;i++){try{if((await fetch(base+"/api/world")).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}if(!ready)throw new Error("Soak server did not start");
 browser=await chromium.launch({headless:true,args:process.platform==="darwin"?["--use-angle=metal","--enable-gpu"]:["--enable-gpu"]});
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors:string[]=[];
 page.on("pageerror",e=>errors.push(e.message));page.on("console",e=>{if(e.type()==="error")errors.push(e.text());});
 await page.goto(base+"/world?overlay=1");await page.waitForSelector('canvas[data-ready="true"]');
 // Measure the render loop without a concurrent SwiftShader builder gate or provider calls.
 for(let i=0;i<300;i++){
  if(i&&i%100===0)await new Promise(r=>setTimeout(r,1100));
  const response=await fetch(base+"/sim/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:`soak-${i}`,userId:`soak-${i}`,displayName:`Neighbor${i}`,color:["#79D7CF","#F2A96B","#D49BE8"][i%3],text:i%13===0&&i>0?`!follow Neighbor${i-1}`:i%9===0?"!dance":"hello island"})});
  if(!response.ok||!(await response.json() as {accepted:boolean}).accepted)throw new Error("Soak crowd admission failed");
 }
 await page.waitForFunction(()=>window.__worldStats.citizenCount===300);await page.waitForTimeout(5000);
 const renderer=await page.evaluate(()=>{const gl=document.querySelector("canvas")!.getContext("webgl2")!,info=gl.getExtension("WEBGL_debug_renderer_info");return info?String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)):"";});
 if(/swiftshader|llvmpipe|software/i.test(renderer)||!renderer)throw new Error("Soak needs a physical GPU");
 await page.evaluate(`(() => { const state={times:[],cpu:[],render:[],last:0,start:performance.now(),frame:window.__worldStats.frame};window.__soak=state;function sample(now){if(state.last){state.times.push(now-state.last);state.cpu.push(window.__worldStats.updateMs);state.render.push(window.__worldStats.renderMs);}state.last=now;requestAnimationFrame(sample);}requestAnimationFrame(sample);})()`);
 const start=performance.now();while(performance.now()-start<seconds*1000)await new Promise(r=>setTimeout(r,Math.min(5000,seconds*1000-(performance.now()-start))));
 const measured=await page.evaluate(()=>{const s=(window as unknown as {__soak:{times:number[];cpu:number[];render:number[];start:number;frame:number}}).__soak,total=s.times.reduce((a,b)=>a+b,0),sorted=s.times.sort((a,b)=>a-b);return {meanUpdateMs:s.cpu.reduce((sum,v)=>sum+v,0)/s.cpu.length,p95UpdateMs:s.cpu.sort((a,b)=>a-b)[Math.floor(s.cpu.length*.95)],meanRenderMs:s.render.reduce((sum,v)=>sum+v,0)/s.render.length,p95RenderMs:s.render.sort((a,b)=>a-b)[Math.floor(s.render.length*.95)],seconds:(performance.now()-s.start)/1000,avgFps:1000*s.times.length/total,p95FrameMs:sorted[Math.floor(sorted.length*.95)],frames:window.__worldStats.frame-s.frame,stats:window.__worldStats};});
 await mkdir("test-results",{recursive:true});await page.screenshot({path:"test-results/soak-world.png"});
 const worktrees=(await git(root,"worktree","list","--porcelain")).split("worktree ").length-1;
 const result={commit:await git(root,"rev-parse","HEAD"),sourceRef:ref,renderer,...measured,seededCitizens:300,errors,worktrees};
 await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result));
 if(errors.length||worktrees!==1||measured.avgFps<50)process.exitCode=1;
}finally{await browser?.close();if(server?.pid)try{process.kill(-server.pid,"SIGTERM");}catch{}await new Promise(r=>setTimeout(r,500));await rm(root,{recursive:true,force:true});}

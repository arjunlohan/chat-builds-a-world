import { spawn } from "node:child_process";
import { mkdtemp, symlink, appendFile, mkdir, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { chromium } from "@playwright/test";
import { git } from "../server/runner/git.js";
import { runBounded } from "../server/runtime/process.js";

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
 const sim=await runBounded({bin:"pnpm",args:["sim"],cwd:root,env,timeoutMs:300_000,maxBytes:65536});
 if(sim.code!==0||sim.reason)throw new Error("pnpm sim did not complete: "+sim.output.slice(-500));
 const renderer=await page.evaluate(()=>{const gl=document.querySelector("canvas")!.getContext("webgl2")!,info=gl.getExtension("WEBGL_debug_renderer_info");return info?String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)):"";});
 if(/swiftshader|llvmpipe|software/i.test(renderer)||!renderer)throw new Error("Soak needs a physical GPU");
 await page.evaluate(()=>{const state={times:[] as number[],last:0,start:performance.now(),frame:window.__worldStats.frame};(window as unknown as {__soak:typeof state}).__soak=state;const sample=(now:number)=>{if(state.last)state.times.push(now-state.last);state.last=now;requestAnimationFrame(sample);};requestAnimationFrame(sample);});
 const start=performance.now();while(performance.now()-start<seconds*1000)await new Promise(r=>setTimeout(r,Math.min(5000,seconds*1000-(performance.now()-start))));
 const measured=await page.evaluate(()=>{const s=(window as unknown as {__soak:{times:number[];start:number;frame:number}}).__soak,total=s.times.reduce((a,b)=>a+b,0),sorted=s.times.sort((a,b)=>a-b);return {seconds:(performance.now()-s.start)/1000,avgFps:1000*s.times.length/total,p95FrameMs:sorted[Math.floor(sorted.length*.95)],frames:window.__worldStats.frame-s.frame,stats:window.__worldStats};});
 await mkdir("test-results",{recursive:true});await page.screenshot({path:"test-results/soak-world.png"});
 const worktrees=(await git(root,"worktree","list","--porcelain")).split("worktree ").length-1;
 const result={commit:await git(root,"rev-parse","HEAD"),sourceRef:ref,renderer,...measured,simExit:sim.code,simOutput:sim.output.trim(),errors,worktrees};
 await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result));
 if(errors.length||worktrees!==1||measured.avgFps<50)process.exitCode=1;
}finally{await browser?.close();if(server?.pid)try{process.kill(-server.pid,"SIGTERM");}catch{}await new Promise(r=>setTimeout(r,500));await rm(root,{recursive:true,force:true});}

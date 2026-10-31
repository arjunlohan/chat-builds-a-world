import {spawn,type ChildProcess} from "node:child_process";
import {once} from "node:events";
import {mkdtemp,symlink,appendFile,rm} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {git,commitTree} from "../server/runner/git.js";
export const delay=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
export async function waitFor<T>(get:()=>Promise<T>,accept:(value:T)=>boolean,ms=15000){const start=Date.now();while(Date.now()-start<ms){try{const value=await get();if(accept(value))return value;}catch{}await delay(100);}throw new Error("Verification timed out");}
/** Private fixture clone, no copied credentials; callers may seed versions before start. */
export async function fixtureServer(source:string,options:{prefix?:string;ref?:string;demo?:boolean}={}){
 const root=await mkdtemp(join(tmpdir(),options.prefix??"world-fixture-")),socket=createServer();await new Promise<void>(r=>socket.listen(0,"127.0.0.1",r));const port=(socket.address() as {port:number}).port;await new Promise<void>(r=>socket.close(()=>r()));
 const env={PATH:process.env.PATH??"/usr/bin:/bin",HOME:process.env.HOME??"",PORT:String(port),SIMULATION_ALLOWED:"1",SIMULATION_MODE:"fixture",...(options.demo?{DEMO_MODE:"1"}:{})},base=`http://127.0.0.1:${port}`;
 try{await git(source,"clone","--quiet","--no-hardlinks","--no-tags",source,root);await git(root,"switch","-C","master",options.ref??"HEAD");// Reset the scripted fixture only in this private clone, including after a prior demo ship.
 const fixture="world/modules/lantern-orchard.ts";if(await git(root,"ls-files",fixture)){await git(root,"rm","--",fixture);await commitTree(root,"Prepare isolated fixture baseline");}await symlink(join(source,"node_modules"),join(root,"node_modules"));await appendFile(join(root,".git/info/exclude"),"\nnode_modules\n");}catch(error){await rm(root,{recursive:true,force:true});throw error;}
 let server:ChildProcess|undefined;
 async function start(inspect=false){let stderr="",inspectorUrl="";server=spawn(process.execPath,[...(inspect?["--inspect=127.0.0.1:0"]:[]),"--import","tsx","server/index.ts"],{cwd:root,env,detached:true,stdio:["ignore","ignore","pipe"]});server.stderr!.on("data",chunk=>{stderr=(stderr+String(chunk)).slice(-8192);inspectorUrl=/ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+/.exec(stderr)?.[0]??inspectorUrl;});
  await waitFor(async()=>(await fetch(base+"/api/world")).ok,ok=>ok&&(!inspect||!!inspectorUrl),20000);return {process:server,inspectorUrl};
 }
 async function stop(crash=false){if(!server?.pid||server.exitCode!==null||server.signalCode!==null)return;const exited=once(server,"exit");if(crash)server.kill("SIGKILL");else try{process.kill(-server.pid,"SIGTERM");}catch{}const timer=setTimeout(()=>{try{process.kill(-server!.pid!,"SIGKILL");}catch{}},10000);try{await exited;}finally{clearTimeout(timer);}}
 return {root,port,base,env,start,crash:()=>stop(true),async dispose(){await stop();await rm(root,{recursive:true,force:true});}};
}

export async function worktreeCount(root:string){return (await git(root,"worktree","list","--porcelain")).split("worktree ").length-1;}

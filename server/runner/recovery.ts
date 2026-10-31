import {execFile} from "node:child_process";
import {readlink,realpath} from "node:fs/promises";
import {drainGroup,minimalEnvironment} from "../runtime/process.js";
/** Only kill an orphan whose live cwd still proves ownership of this exact worktree. */
export async function stopOrphan(pid:number,owner:number,tree:string){
 if(!Number.isSafeInteger(pid)||pid<2||!Number.isSafeInteger(owner)||owner<2)throw new Error("Invalid interrupted builder ownership");
 try{process.kill(owner,0);throw new Error("The previous build owner is still running.");}catch(error){if((error as NodeJS.ErrnoException).code!=="ESRCH")throw error;}
 try{process.kill(pid,0);}catch(error){if((error as NodeJS.ErrnoException).code==="ESRCH")return;throw error;}
 const cwd=process.platform==="linux"?await readlink(`/proc/${pid}/cwd`).catch(()=>""):await new Promise<string>(done=>execFile("/usr/sbin/lsof",["-a","-p",String(pid),"-d","cwd","-Fn"],{env:minimalEnvironment(process.env),timeout:2000,maxBuffer:8192},(_error,text)=>done(text.split("\n").find(line=>line.startsWith("n"))?.slice(1)??"")));
 const expected=await realpath(tree).catch(()=>tree),actual=await realpath(cwd).catch(()=>cwd);if(!cwd||actual!==expected)throw new Error("Cannot verify the interrupted builder; recovery stopped without touching its worktree.");
 await drainGroup(pid);
}

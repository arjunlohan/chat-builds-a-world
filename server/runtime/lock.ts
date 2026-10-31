import {mkdir,writeFile,link,unlink,readFile} from "node:fs/promises";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {exists} from "./process.js";
/** Link a complete owner record atomically; no empty-file acquisition window. */
export async function acquireLock(root:string,name="build"){
 const directory=join(root,"state"),path=join(directory,`${name}.lock`),token=randomUUID(),candidate=join(directory,`.${name}-${token}.tmp`);await mkdir(directory,{recursive:true});await writeFile(candidate,JSON.stringify({pid:process.pid,token}),{mode:0o600});
 try{for(let attempt=0;attempt<3;attempt++)try{await link(candidate,path);return async()=>{const owner=await readFile(path,"utf8").then(JSON.parse).catch(()=>null);if(owner?.token===token)await unlink(path).catch(()=>{});};}catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;const owner=await readFile(path,"utf8").then(JSON.parse).catch(()=>null);if(!Number.isSafeInteger(owner?.pid)||exists(owner.pid))throw new Error(`Another ${name} process owns this repository.`);await unlink(path).catch(()=>{});}throw new Error(`Could not acquire ${name} lock.`);}
 finally{await unlink(candidate).catch(()=>{});}
}

import {mkdir,open,readFile,rename,rm} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {randomUUID} from "node:crypto";
const directories=new Map<string,Promise<unknown>>(),writes=new Map<string,Promise<void>>();
export async function readJson<T>(path:string):Promise<T|undefined>{try{return JSON.parse(await readFile(path,"utf8")) as T;}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return;throw new Error("Saved JSON is invalid.");}}
export async function atomicJson(path:string,value:unknown){
 path=resolve(path);
 const write=(writes.get(path)??Promise.resolve()).catch(()=>{}).then(async()=>{
  const directory=dirname(path);let ready=directories.get(directory);if(!ready){ready=mkdir(directory,{recursive:true,mode:0o700});directories.set(directory,ready);void ready.catch(()=>directories.delete(directory));}await ready;
  const temporary=`${path}.${randomUUID()}.tmp`;
  try{const file=await open(temporary,"wx",0o600);try{await file.writeFile(JSON.stringify(value));await file.sync();}finally{await file.close();}await rename(temporary,path);}
  catch(error){await rm(temporary,{force:true}).catch(()=>{});throw error;}
 });writes.set(path,write);try{await write;}finally{if(writes.get(path)===write)writes.delete(path);}
}

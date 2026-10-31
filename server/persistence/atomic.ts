import {mkdir,open,rename,rm} from "node:fs/promises";
import {dirname} from "node:path";
import {randomUUID} from "node:crypto";
export async function atomicJson(path:string,value:unknown){
 await mkdir(dirname(path),{recursive:true});const temporary=`${path}.${randomUUID()}.tmp`;
 try{const file=await open(temporary,"wx",0o600);try{await file.writeFile(JSON.stringify(value));await file.sync();}finally{await file.close();}await rename(temporary,path);}
 finally{await rm(temporary,{force:true});}
}

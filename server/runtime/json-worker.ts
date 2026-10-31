import {fileURLToPath} from "node:url";
import {runBounded,minimalEnvironment} from "./process.js";
import {typescriptArgs} from "./typescript.js";
/** A checked terminal line is authoritative. Cleanup is SIGKILL, outside verdict timing. */
export async function jsonWorker<T extends {ok:boolean}>(options:{script:string;args?:string[];input?:string;signal:AbortSignal;timeoutMs:number;verdict(value:unknown):value is T}){
 let browserPid=0,result:T|undefined;
 const raw=await runBounded({bin:process.execPath,args:typescriptArgs(options.script,...options.args??[]),cwd:fileURLToPath(new URL("../..",import.meta.url)),env:minimalEnvironment(process.env),signal:options.signal,timeoutMs:options.timeoutMs,maxBytes:65536,...(options.input!==undefined?{input:options.input}:{}),
  onLine(line){try{const event=JSON.parse(line) as {browserPid?:number};if(Number.isSafeInteger(event.browserPid)&&event.browserPid!>1)browserPid=event.browserPid!;}catch{}},
  isComplete(line){let event:unknown;try{event=JSON.parse(line);}catch{return false;}if(!options.verdict(event))return false;result=event;return true;},
  onKill(){if(browserPid)try{process.kill(process.platform==="win32"?browserPid:-browserPid,"SIGKILL");}catch{}}
 });
 return raw.completed&&result?{verdict:result}:{error:raw.error??"returned no valid verdict."};
}
export const isVerdict=(value:unknown):value is {ok:boolean;reason?:string}=>!!value&&typeof value==="object"&&typeof (value as {ok?:unknown}).ok==="boolean"&&((value as {ok:boolean}).ok||typeof (value as {reason?:unknown}).reason==="string");

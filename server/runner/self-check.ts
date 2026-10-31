import {readFile,writeFile,mkdir} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";
import {compileModule} from "./policy.js";
import {redact,protectedValues} from "../runtime/process.js";
import type {Usage} from "../../world/shared/limits.js";
import {typescriptArgs} from "../runtime/typescript.js";
import {jsonWorker,isVerdict} from "../runtime/json-worker.js";
export const SELF_CHECK_TIMEOUT_MS=12_000;
export interface ResourceContext {base?:Usage;retained:{id:string;file:string;code:string}[]}
export interface SelfCheckInput extends ResourceContext {file:string;id:string;files:string[]}
export interface SelfCheckResult {ok:boolean;reason?:string;retryable?:boolean;usage?:Usage;pool?:Usage;retained?:Usage;available?:Usage}
export async function resourceCheck(input:ResourceContext,modules:ResourceContext["retained"],signal:AbortSignal,candidateId?:string):Promise<SelfCheckResult>{
 const raw=await jsonWorker<SelfCheckResult>({script:fileURLToPath(new URL("./resources.worker.ts",import.meta.url)),signal,timeoutMs:SELF_CHECK_TIMEOUT_MS,input:JSON.stringify({...input,modules,candidateId}),verdict:isVerdict});
 return raw.verdict??{ok:false,reason:`Resource check ${raw.error}`,retryable:false};
}
export async function selfCheck(tree:string,input:SelfCheckInput,signal:AbortSignal){
 const compiled=await compileModule(tree,input.file,input.id,fileURLToPath(new URL("../../node_modules",import.meta.url)),input.files);
 const modules=[...input.retained,{...compiled,file:input.file}];
 const resources=await resourceCheck(input,modules,signal,compiled.id);
 return {compiled,modules,resources};
}
export function selfCheckCommand(manifest:string){return [process.execPath,...typescriptArgs(fileURLToPath(new URL("./self-check.ts",import.meta.url)),manifest,"--static-only")].map(value=>`'${value.replaceAll("'","'\\''")}'`).join(" ");}
export async function selfCheckManifest(root:string,input:SelfCheckInput){const directory=join(root,"state/self-checks");await mkdir(directory,{recursive:true});const file=join(directory,`${randomUUID()}.json`);await writeFile(file,JSON.stringify(input),{mode:0o600});return file;}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{const input=JSON.parse(await readFile(process.argv[2]!,"utf8")) as SelfCheckInput;
  if(process.argv.includes("--static-only")){await compileModule(process.cwd(),input.file,input.id,fileURLToPath(new URL("../../node_modules",import.meta.url)),input.files);console.log(JSON.stringify({ok:true,checks:["policy","types"],resources:"runner-only"}));}
  else{const checked=await selfCheck(process.cwd(),input,new AbortController().signal);console.log(JSON.stringify({...checked.resources,...(checked.resources.reason?{reason:redact(checked.resources.reason,protectedValues(process.env))}:{})}));if(!checked.resources.ok)process.exitCode=1;}}
 catch(error){console.error(redact(error instanceof Error?error.message:"Self-check failed.",protectedValues(process.env)));process.exitCode=1;}
}

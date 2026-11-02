import type {ModelName} from "../../world/shared/model-kit.js";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";
import {compileModule} from "./policy.js";
import {redact,protectedValues} from "../runtime/process.js";
import type {Usage} from "../../world/shared/limits.js";
import {typescriptArgs} from "../runtime/typescript.js";
import {jsonWorker} from "../runtime/json-worker.js";
import {CandidateCodeError,isGateVerdict,candidateRejected,infrastructureFailed,type GateVerdict} from "./verdict.js";
export const SELF_CHECK_TIMEOUT_MS=12_000;
/** Compilation and cold Chromium startup precede the bounded allocation probe. */
export const RESOURCE_STARTUP_TIMEOUT_MS=30_000;
export interface ResourceContext {base?:Usage;retained:{id:string;file:string;code:string;modelKinds?:readonly ModelName[]}[]}
export interface SelfCheckInput extends ResourceContext {file:string;id:string;files:string[]}
export type SelfCheckResult=GateVerdict&{usage?:Usage;pool?:Usage;retained?:Usage;available?:Usage};
export async function resourceCheck(input:ResourceContext,modules:ResourceContext["retained"],signal:AbortSignal,candidateId?:string):Promise<SelfCheckResult>{
 const raw=await jsonWorker<SelfCheckResult>({script:fileURLToPath(new URL("./resources.worker.ts",import.meta.url)),signal,timeoutMs:SELF_CHECK_TIMEOUT_MS,startupTimeoutMs:RESOURCE_STARTUP_TIMEOUT_MS,input:JSON.stringify({...input,modules,candidateId}),verdict:isGateVerdict});
 return raw.verdict??infrastructureFailed(`Resource check ${raw.error}`);
}
export async function staticCheck(tree:string,input:SelfCheckInput){
 try{return {verdict:{ok:true} as GateVerdict,compiled:await compileModule(tree,input.file,input.id,fileURLToPath(new URL("../../node_modules",import.meta.url)),input.files)};}
 catch(error){const reason=error instanceof Error?error.message:"Static checker failed.";return{verdict:error instanceof CandidateCodeError?candidateRejected(reason):infrastructureFailed(reason)};}
}
export async function selfCheck(tree:string,input:SelfCheckInput,signal:AbortSignal){
 const checked=await staticCheck(tree,input);if(!checked.compiled)return {modules:[],resources:checked.verdict as SelfCheckResult};const compiled=checked.compiled;
 const modules=[...input.retained,{...compiled,file:input.file}];
 const resources=await resourceCheck(input,modules,signal,compiled.id);
 return {compiled,modules,resources};
}
export function selfCheckCommand(manifest:string){return [process.execPath,...typescriptArgs(fileURLToPath(new URL("./self-check.ts",import.meta.url)),manifest,"--static-only")].map(value=>`'${value.replaceAll("'","'\\''")}'`).join(" ");}
export async function selfCheckManifest(root:string,input:SelfCheckInput){const directory=join(root,"state/self-checks");await mkdir(directory,{recursive:true});const file=join(directory,`${randomUUID()}.json`);await writeFile(file,JSON.stringify(input),{mode:0o600});return file;}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{const input=JSON.parse(await readFile(process.argv[2]!,"utf8")) as SelfCheckInput;
  if(process.argv.includes("--static-only")){const checked=await staticCheck(process.cwd(),input);if(checked.verdict.ok)console.log(JSON.stringify({ok:true,checks:["policy","types"],resources:"runner-only"}));else{console.log(JSON.stringify({...checked.verdict,reason:redact(checked.verdict.reason,protectedValues(process.env))}));process.exitCode=1;}}
  else{const checked=await selfCheck(process.cwd(),input,new AbortController().signal);console.log(JSON.stringify({...checked.resources,...(checked.resources.reason?{reason:redact(checked.resources.reason,protectedValues(process.env))}:{})}));if(!checked.resources.ok)process.exitCode=1;}}
 catch(error){console.error(redact(error instanceof Error?error.message:"Self-check failed.",protectedValues(process.env)));process.exitCode=1;}
}

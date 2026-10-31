import {readFile,writeFile,mkdir} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";
import {compileModule} from "./policy.js";
import {runBounded,minimalEnvironment,redact,protectedValues} from "../runtime/process.js";
import type {Usage} from "../../world/shared/limits.js";
export const SELF_CHECK_TIMEOUT_MS=12_000;
export interface ResourceContext {base?:Usage;retained:{id:string;file:string;code:string}[]}
export interface SelfCheckInput extends ResourceContext {file:string;id:string;files:string[]}
export interface SelfCheckResult {ok:boolean;reason?:string;retryable?:boolean;usage?:Usage;pool?:Usage;retained?:Usage;available?:Usage}
export async function resourceCheck(input:ResourceContext,modules:ResourceContext["retained"],signal:AbortSignal,candidateId?:string):Promise<SelfCheckResult>{
 let browserPid=0;
 const raw=await runBounded({bin:process.execPath,args:[fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs",import.meta.url)),fileURLToPath(new URL("./resources.worker.ts",import.meta.url))],cwd:fileURLToPath(new URL("../..",import.meta.url)),env:minimalEnvironment(process.env),signal,timeoutMs:SELF_CHECK_TIMEOUT_MS,maxBytes:65536,input:JSON.stringify({...input,modules,candidateId}),onLine(line){const e=JSON.parse(line) as {browserPid?:number};if(Number.isSafeInteger(e.browserPid))browserPid=e.browserPid!;},onKill(){if(browserPid)try{process.kill(process.platform==="win32"?browserPid:-browserPid,"SIGKILL");}catch{}}});
 if(raw.error)return {ok:false,reason:`Resource check ${raw.error}`,retryable:false};
 try{return JSON.parse(raw.output.trim().split("\n").at(-1)!) as SelfCheckResult;}catch{return {ok:false,reason:"Resource checker returned invalid output.",retryable:false};}
}
export async function selfCheck(tree:string,input:SelfCheckInput,signal:AbortSignal){
 const compiled=await compileModule(tree,input.file,input.id,fileURLToPath(new URL("../../node_modules",import.meta.url)),input.files);
 const modules=[...input.retained,{...compiled,file:input.file}];
 const resources=await resourceCheck(input,modules,signal,compiled.id);
 return {compiled,modules,resources};
}
export function selfCheckCommand(manifest:string){return [process.execPath,fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs",import.meta.url)),fileURLToPath(new URL("./self-check.ts",import.meta.url)),manifest].map(value=>`'${value.replaceAll("'","'\\''")}'`).join(" ");}
export async function selfCheckManifest(root:string,input:SelfCheckInput){const directory=join(root,"state/self-checks");await mkdir(directory,{recursive:true});const file=join(directory,`${randomUUID()}.json`);await writeFile(file,JSON.stringify(input),{mode:0o600});return file;}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{const input=JSON.parse(await readFile(process.argv[2]!,"utf8")) as SelfCheckInput;const checked=await selfCheck(process.cwd(),input,new AbortController().signal);console.log(JSON.stringify({...checked.resources,...(checked.resources.reason?{reason:redact(checked.resources.reason,protectedValues(process.env))}:{})}));if(!checked.resources.ok)process.exitCode=1;}
 catch(error){console.error(redact(error instanceof Error?error.message:"Self-check failed.",protectedValues(process.env)));process.exitCode=1;}
}

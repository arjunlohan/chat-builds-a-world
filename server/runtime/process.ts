import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { readFile, mkdir, mkdtemp, writeFile, rm, readdir } from "node:fs/promises";
import { resolve } from "node:path";
export const protectedValues = (env: NodeJS.ProcessEnv) => [...new Set(Object.entries(env).filter(([k,v]) => /TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY/i.test(k) && v && v.length >= 8).map(([,v]) => v!))];
const redactSecrets = (text: string, values: readonly string[]) => { for (const value of values) text = text.split(value).join("[REDACTED]"); return text; };
export function redact(text: string, values: readonly string[]) { return redactSecrets(text,values).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 600); }
export function minimalEnvironment(env: NodeJS.ProcessEnv, root?: string): NodeJS.ProcessEnv {
  return { PATH: env.PATH ?? "/usr/bin:/bin", HOME: env.HOME ?? homedir(), ...(root ? { AWS_BEARER_TOKEN_BEDROCK: env.AWS_BEARER_TOKEN_BEDROCK ?? "", CODEX_HOME: resolve(root, ".codex-runtime") } : {}) };
}
interface HomeOptions { remove?: typeof rm; warn?: (message: string) => void }
const startup = new Map<string, Promise<void>>();
const exists = (pid: number) => { try { process.kill(pid,0); return true; } catch(error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; } };
function warning(error: unknown, env: NodeJS.ProcessEnv, warn = console.warn) { warn(`Runtime home cleanup deferred: ${redact(error instanceof Error ? error.message : "filesystem error",protectedValues(env))}`); }
async function removeHome(owned: string, env: NodeJS.ProcessEnv, options: HomeOptions) {
  try { await (options.remove??rm)(owned,{recursive:true,force:true}); }
  catch(error) { warning(error,env,options.warn); }
}
/** One nonfatal startup sweep per repository; live owners are never removed. */
export function cleanupStaleCodexHomes(root: string, env: NodeJS.ProcessEnv = process.env, options: HomeOptions = {}): Promise<void> {
  root=resolve(root);
  let pending=startup.get(root);
  if(!pending){pending=(async()=>{
    const directory=resolve(root,".codex-runtime/runs");
    for(const entry of await readdir(directory,{withFileTypes:true}).catch(()=>[])){
      if(!entry.isDirectory()||!/^invocation-[a-zA-Z0-9-]+$/.test(entry.name))continue;
      const owned=resolve(directory,entry.name);
      // The PID in new names closes the mkdir/owner-file window across processes.
      const owner=await readFile(resolve(owned,".owner.json"),"utf8").then(text=>(JSON.parse(text) as {owner?:number}).owner).catch(()=>Number(/^invocation-(\d+)-/.exec(entry.name)?.[1]));
      if(typeof owner==="number"&&Number.isSafeInteger(owner)&&owner>1&&exists(owner))continue;
      await removeHome(owned,env,options);
    }
  })().catch(error=>warning(error,env,options.warn));startup.set(root,pending);}
  return pending;
}
/** Own all Codex-specific state here; runBounded only knows about process lifecycle. */
export async function withCodexHome<T>(root: string, env: NodeJS.ProcessEnv, run: (env: NodeJS.ProcessEnv, runtime: { config: string; onSpawn(pid: number): Promise<void> }) => Promise<T>, options: HomeOptions = {}): Promise<T> {
  await cleanupStaleCodexHomes(root,env,options);
  const directory=resolve(root,".codex-runtime/runs");await mkdir(directory,{recursive:true});
  const owned=await mkdtemp(resolve(directory,`invocation-${process.pid}-`)),home=resolve(owned,".codex-runtime");
  try {
    await mkdir(home);
    const owner=resolve(owned,".owner.json"),config=await readFile(resolve(root,".codex-runtime/config.toml"),"utf8").catch(()=>"");
    await writeFile(owner,JSON.stringify({owner:process.pid}));await writeFile(resolve(home,"config.toml"),config,{mode:0o600});
    return await run({...minimalEnvironment(env,root),CODEX_HOME:home},{config,onSpawn:pid=>writeFile(owner,JSON.stringify({owner:pid}))});
  }finally{await removeHome(owned,env,options);}
}
export function codexArgs(config: string, sandbox: "read-only" | "workspace-write", effort: "low" | "medium", schema?: string) {
  const setting = (key: string, fallback: string) => new RegExp(`^${key}\\s*=\\s*"([a-zA-Z0-9_.-]+)"`, "m").exec(config)?.[1] ?? fallback;
  // Discovery controls live in the copied config, not duplicated as argv overrides.
  return ["--no-daemon", "exec", "--strict-config", "--sandbox", sandbox, "--ephemeral", "--json", ...(schema ? ["--output-schema", schema] : []), "-c", `model_reasoning_effort="${effort}"`, "-c", 'approval_policy="never"', "-c", `model_provider="${setting("model_provider", "amazon-bedrock")}"`, "--model", setting("model", "openai.gpt-6.1-sol"), "-"];
}
export function turnFailure(event: unknown): string | undefined {
  const e=event as {type?:string;error?:{message?:string};message?:string};
  if(e?.type==="turn.failed")return e.error?.message??e.message??"Codex turn failed";
}
export type BoundedReason = "cancelled" | "timeout" | "start" | "output-limit" | "invalid-output";
export function boundedFailure(reason: BoundedReason, lane: string, timeoutSeconds: number) {
  const messages:Record<BoundedReason,string>={timeout:`${lane} timed out after ${timeoutSeconds} seconds.`,cancelled:`${lane} cancelled.`,start:`${lane} could not start the configured process.`,"output-limit":`${lane} output exceeded its limit.`,"invalid-output":`${lane} returned malformed events.`};
  return messages[reason];
}
/** Drain descendants even when the leader exits successfully or closes its stdio early. */
export async function drainGroup(pid: number) {
  if(process.platform==="win32")return;
  try{process.kill(-pid,"SIGKILL");}catch{return;}
  for(let attempt=0;attempt<40;attempt++){try{process.kill(-pid,0);}catch{return;}await new Promise<void>(done=>setTimeout(done,10));}
  // An unreaped zombie cannot write. SIGKILL has stopped every live group member.
}
export interface BoundedOptions { bin: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv; secrets?: readonly string[]; input?: string; signal?: AbortSignal | undefined; timeoutMs: number; maxBytes: number; onSpawn?(pid: number): void | Promise<void>; onLine?(line: string): void; onKill?(): void | Promise<void> }
export async function runBounded(o: BoundedOptions): Promise<{ output: string; code: number | null; reason?: BoundedReason }> {
  if(o.signal?.aborted)return {output:"",code:null,reason:"cancelled"};
  const secrets=o.secrets??protectedValues(o.env);
  return new Promise(resolveRun => {
    let output="",buffer="",bytes=0,reason:BoundedReason|undefined,closed=false;
    let child:ReturnType<typeof spawn>,drained:Promise<unknown>|undefined,spawned=Promise.resolve();
    const finish=(code:number|null)=>{if(closed)return;closed=true;clearTimeout(timer);o.signal?.removeEventListener("abort",abort);resolveRun({output,code,...(reason?{reason}:{})});};
    const drain=()=>drained??=Promise.all([child.pid?drainGroup(child.pid):Promise.resolve(),Promise.resolve().then(()=>o.onKill?.()).catch(()=>{})]);
    const kill=(why:BoundedReason)=>{if(reason)return;reason=why;if(process.platform==="win32")child.kill("SIGKILL");void drain();};
    const abort=()=>kill("cancelled"),timer=setTimeout(()=>kill("timeout"),o.timeoutMs);
    const line=(raw:string,newline:boolean)=>{const safe=redactSecrets(raw,secrets);output+=safe+(newline?"\n":"");try{o.onLine?.(safe);}catch{kill("invalid-output");}};
    try{child=spawn(o.bin,o.args,{cwd:o.cwd,env:o.env,shell:false,detached:process.platform!=="win32",stdio:["pipe","pipe","pipe"]});}
    catch{reason="start";finish(null);return;}
    if(child.pid)spawned=Promise.resolve().then(()=>o.onSpawn?.(child.pid!)).then(()=>{}).catch(()=>kill("start"));
    o.signal?.addEventListener("abort",abort,{once:true});if(o.signal?.aborted)abort();
    child.once("exit",()=>{void drain();});
    child.stdout!.setEncoding("utf8");child.stdout!.on("data",(chunk:string)=>{
      bytes+=Buffer.byteLength(chunk);if(bytes>o.maxBytes){buffer="";kill("output-limit");return;}
      buffer+=chunk;let i:number;while((i=buffer.indexOf("\n"))>=0){line(buffer.slice(0,i),true);buffer=buffer.slice(i+1);}
    });
    child.stderr!.on("data",(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>o.maxBytes)kill("output-limit");});
    child.stdin!.on("error",()=>{});child.once("error",()=>{reason??="start";});
    child.once("close",code=>{if(buffer.trim())line(buffer,false);void Promise.all([drained,spawned]).then(()=>finish(code));});
    child.stdin!.end(o.input);
  });
}

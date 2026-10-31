import { spawn, execFile } from "node:child_process";
import { homedir } from "node:os";
import { readFile, mkdir, mkdtemp, writeFile, rm, readdir, stat } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
export const protectedValues = (env: NodeJS.ProcessEnv) => [...new Set(Object.entries(env).filter(([k,v]) => /TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY/i.test(k) && v && v.length >= 8).map(([,v]) => v!))];
export function redact(text: string, values: readonly string[]) { for (const value of values) text = text.split(value).join("[REDACTED]"); return text.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 600); }
export function minimalEnvironment(env: NodeJS.ProcessEnv, root?: string): NodeJS.ProcessEnv {
  return { PATH: env.PATH ?? "/usr/bin:/bin", HOME: env.HOME ?? homedir(), ...(root ? { AWS_BEARER_TOKEN_BEDROCK: env.AWS_BEARER_TOKEN_BEDROCK ?? "", CODEX_HOME: resolve(root, ".codex-runtime") } : {}) };
}
interface HomeLease { owner: number; active: boolean; group?: number; groupStarted?: string }
interface HomeOptions { remove?: typeof rm; warn?: (message: string) => void }
const activeHomes = new Set<string>();
const startup = new Map<string, Promise<void>>();
const exists = (pid: number) => { try { process.kill(pid,0); return true; } catch(error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; } };
const pause = (ms: number) => new Promise<void>(done => setTimeout(done,ms));
function warning(error: unknown, env: NodeJS.ProcessEnv, warn = console.warn) { warn(`Runtime home cleanup deferred: ${redact(error instanceof Error ? error.message : "filesystem error",protectedValues(env))}`); }
async function removeHome(owned: string, env: NodeJS.ProcessEnv, options: HomeOptions = {}) {
  const remove=options.remove??rm;
  for(let attempt=0;attempt<6;attempt++)try{await remove(owned,{recursive:true,force:true,maxRetries:2,retryDelay:40});await pause(30);if(await stat(owned).then(()=>true).catch(()=>false)){if(attempt<5)continue;throw Object.assign(new Error("Late runtime writer recreated its home"),{code:"ENOTEMPTY"});}return true;}catch(error){
    if(attempt===5||!["ENOTEMPTY","EBUSY","EPERM"].includes((error as NodeJS.ErrnoException).code??"")){warning(error,env,options.warn);return false;}
    await pause(40*(attempt+1));
  }
  return false;
}
/** Drain the entire owned process group, including children with ignored stdio, on success too. */
async function groupIdentity(pid: number) {
  return new Promise<string>(done=>execFile("ps",["-p",String(pid),"-o","lstart="],{env:minimalEnvironment(process.env),timeout:500,maxBuffer:4096},(error,output)=>done(error?"":output.trim())));
}
async function drainGroup(pid: number) {
  if(process.platform==="win32")return;
  try{process.kill(-pid,"SIGKILL");}catch{return;}
  for(let attempt=0;attempt<40;attempt++){try{process.kill(-pid,0);}catch{return;}await pause(10);}
  // A reparented zombie cannot write; SIGKILL has already stopped all live members.
}
async function emptyTree(path: string, depth=0):Promise<boolean> {
 if(depth>20)return false;const entries=await readdir(path,{withFileTypes:true});
 if(entries.length>128)return false;
 for(const entry of entries)if(!entry.isDirectory()||!await emptyTree(resolve(path,entry.name),depth+1))return false;
 return true;
}
export async function cleanupStaleCodexHomes(root: string, env: NodeJS.ProcessEnv = process.env, options: HomeOptions = {}) {
  const directory=resolve(root,".codex-runtime/runs");
  const entries=await readdir(directory,{withFileTypes:true}).catch(()=>[]);
  for(const entry of entries){
    if(!entry.isDirectory()||!/^invocation-[a-zA-Z0-9]+$/.test(entry.name))continue;
    const owned=resolve(directory,entry.name);if(activeHomes.has(owned))continue;
    try {
    const lease:HomeLease|undefined=await readFile(resolve(owned,".owner.json"),"utf8").then(JSON.parse).catch(()=>undefined);
    if(lease?.active&&Number.isSafeInteger(lease.owner)&&lease.owner>1&&exists(lease.owner))continue;
    // Legacy homes lack a lease. Avoid another old server's possible 180s builder.
    if(!lease){const age=Date.now()-(await stat(owned)).mtimeMs;if(age<3000||(age<210_000&&!await emptyTree(owned)))continue;}
    if(lease?.group&&Number.isSafeInteger(lease.group)&&lease.group>1&&lease.groupStarted&&await groupIdentity(lease.group)===lease.groupStarted)await drainGroup(lease.group);
    await removeHome(owned,env,options);
    } catch(error) { if((error as NodeJS.ErrnoException).code!=="ENOENT")warning(error,env,options.warn); }
  }
}
/** Seed an isolated home; housekeeping can never replace a valid verdict with an exception. */
export async function withCodexHome<T>(root: string, env: NodeJS.ProcessEnv, run: (env: NodeJS.ProcessEnv) => Promise<T>, options: HomeOptions = {}): Promise<T> {
  let recovered=startup.get(root);if(!recovered){recovered=cleanupStaleCodexHomes(root,env,options).catch(error=>warning(error,env,options.warn));startup.set(root,recovered);}await recovered;
  const directory=resolve(root,".codex-runtime/runs");await mkdir(directory,{recursive:true});
  const owned=await mkdtemp(resolve(directory,"invocation-")),home=resolve(owned,".codex-runtime");activeHomes.add(owned);
  await mkdir(home);await writeFile(resolve(owned,".owner.json"),JSON.stringify({owner:process.pid,active:true} satisfies HomeLease));
  try {
    const config=await readFile(resolve(root,".codex-runtime/config.toml"),"utf8").catch(()=>"");
    await writeFile(resolve(home,"config.toml"),config,{mode:0o600});
    return await run({...minimalEnvironment(env,root),CODEX_HOME:home});
  }finally{
    activeHomes.delete(owned);
    const lease=await readFile(resolve(owned,".owner.json"),"utf8").then(JSON.parse).catch(()=>({owner:process.pid}));
    await writeFile(resolve(owned,".owner.json"),JSON.stringify({...lease,active:false})).catch(error=>warning(error,env,options.warn));
    await removeHome(owned,env,options);
  }
}
export async function codexArgs(root: string, sandbox: "read-only" | "workspace-write", effort: "low" | "medium", schema?: string) {
  const config = await readFile(resolve(root, ".codex-runtime/config.toml"), "utf8").catch(() => "");
  const setting = (key: string, fallback: string) => new RegExp(`^${key}\\s*=\\s*"([a-zA-Z0-9_.-]+)"`, "m").exec(config)?.[1] ?? fallback;
  return ["--no-daemon", "exec", "--strict-config", "--disable", "plugins", "--disable", "remote_plugin", "--disable", "plugin_discovery_prefetch", "--disable", "apps", "--disable", "skill_mcp_dependency_install", "--disable", "hooks", "--enable", "skip_host_skill_discovery", "-c", "suppress_unstable_features_warning=true", "--sandbox", sandbox, "--ephemeral", "--json", ...(schema ? ["--output-schema", schema] : []), "-c", `model_reasoning_effort="${effort}"`, "-c", 'approval_policy="never"', "-c", `model_provider="${setting("model_provider", "amazon-bedrock")}"`, "--model", setting("model", "openai.gpt-6.1-sol"), "-"];
}
type CliEvent = { type?: string; message?: string; level?: string; severity?: string; error_type?: string; error?: { message?: string }; item?: { type?: string; message?: string; text?: string; level?: string; severity?: string; error_type?: string } };
export function isCliWarning(event: unknown) {
  const e=event as CliEvent;if(!e||e.type==="turn.failed")return false;
  const message=e.error?.message??e.message??e.item?.message??e.item?.text??"";
  return [e.level,e.severity,e.error_type,e.item?.level,e.item?.severity,e.item?.error_type,e.item?.type].some(v=>v==="warning") || /^(warning\b|reconnecting\b)|\b(?:ignored config|config warning)\b/i.test(message);
}
export function cliFailure(event: unknown): string | undefined {
  const e=event as CliEvent;if(!e||isCliWarning(e))return;
  if(e.type==="turn.failed"||e.type==="error"||e.item?.type==="error")return e.error?.message??e.message??e.item?.message??e.item?.text??"Codex turn failed";
}
export interface BoundedOptions { bin: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv; input?: string; signal?: AbortSignal | undefined; timeoutMs: number; maxBytes: number; onLine?(line: string): void; onKill?(): void }
/** All callers wait for close after cancellation, so queued Git operations never race child cleanup. */
export async function runBounded(o: BoundedOptions): Promise<{ output: string; code: number | null; reason?: string }> {
  if(o.signal?.aborted)return {output:"",code:null,reason:"cancelled"};
  return new Promise(resolveRun => {
    let output = "", buffer = "", bytes = 0, reason: string | undefined, closed = false;
    let child: ReturnType<typeof spawn>;
    let drained: Promise<void> | undefined, leaseWrite=Promise.resolve();
    const finish = (code: number | null) => { if (closed) return; closed = true; clearTimeout(timer); o.signal?.removeEventListener("abort", abort); resolveRun({ output, code, ...(reason ? { reason } : {}) }); };
    const kill = (why: string) => { if (reason) return; reason = why; o.onKill?.(); try { if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL"); else child.kill("SIGKILL"); } catch {} };
    const abort = () => kill("cancelled");
    const timer = setTimeout(() => kill("timeout"), o.timeoutMs);
    try { child = spawn(o.bin, o.args, { cwd: o.cwd, env: o.env, shell: false, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"] }); }
    catch { reason = "start"; finish(null); return; }
    o.signal?.addEventListener("abort", abort, { once: true }); if (o.signal?.aborted) abort();
    const home=o.env.CODEX_HOME;
    if(child.pid&&home&&basename(home)===".codex-runtime"&&/^invocation-[a-zA-Z0-9]+$/.test(basename(dirname(home))))leaseWrite=(async()=>{const groupStarted=await groupIdentity(child.pid!);await writeFile(resolve(home,"../.owner.json"),JSON.stringify({owner:process.pid,active:true,group:child.pid!,groupStarted} satisfies HomeLease));})().catch(()=>{});
    child.once("exit",()=>{o.onKill?.();drained=drainGroup(child.pid!);});
    child.stdout!.setEncoding("utf8"); child.stdout!.on("data", (chunk: string) => {
      bytes += Buffer.byteLength(chunk); if (bytes > o.maxBytes) { kill("output-limit"); return; }
      output += chunk; buffer += chunk; let i: number;
      while ((i = buffer.indexOf("\n")) >= 0) { try { o.onLine?.(buffer.slice(0,i)); } catch { kill("invalid-output"); } buffer = buffer.slice(i+1); }
    });
    child.stderr!.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > o.maxBytes) kill("output-limit"); });
    child.stdin!.on("error", () => {}); child.once("error", () => { reason ??= "start"; });
    child.once("close", code => { if (buffer.trim()) try { o.onLine?.(buffer); } catch { reason ??= "invalid-output"; } void Promise.all([drained??Promise.resolve(),leaseWrite]).then(()=>finish(code)); });
    child.stdin!.end(o.input);
  });
}

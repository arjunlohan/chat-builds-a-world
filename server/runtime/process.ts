import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { readFile, mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
export const protectedValues = (env: NodeJS.ProcessEnv) => [...new Set(Object.entries(env).filter(([k,v]) => /TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY/i.test(k) && v && v.length >= 8).map(([,v]) => v!))];
export function redact(text: string, values: readonly string[]) { for (const value of values) text = text.split(value).join("[REDACTED]"); return text.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 600); }
export function minimalEnvironment(env: NodeJS.ProcessEnv, root?: string): NodeJS.ProcessEnv {
  return { PATH: env.PATH ?? "/usr/bin:/bin", HOME: env.HOME ?? homedir(), ...(root ? { AWS_BEARER_TOKEN_BEDROCK: env.AWS_BEARER_TOKEN_BEDROCK ?? "", CODEX_HOME: resolve(root, ".codex-runtime") } : {}) };
}
/** Codex may persist runtime settings. Never give it the tracked canonical config as writable home. */
export async function withCodexHome<T>(root: string, env: NodeJS.ProcessEnv, run: (env: NodeJS.ProcessEnv) => Promise<T>): Promise<T> {
  const directory=resolve(root,".codex-runtime/runs");await mkdir(directory,{recursive:true});
  const owned=await mkdtemp(resolve(directory,"invocation-")),home=resolve(owned,".codex-runtime");await mkdir(home);
  try {
    const config=await readFile(resolve(root,".codex-runtime/config.toml"),"utf8").catch(()=>"");
    await writeFile(resolve(home,"config.toml"),config,{mode:0o600});
    return await run({...minimalEnvironment(env,root),CODEX_HOME:home});
  }finally{await rm(owned,{recursive:true,force:true});}
}
export async function codexArgs(root: string, sandbox: "read-only" | "workspace-write", effort: "low" | "medium", schema?: string) {
  const config = await readFile(resolve(root, ".codex-runtime/config.toml"), "utf8").catch(() => "");
  const setting = (key: string, fallback: string) => new RegExp(`^${key}\\s*=\\s*"([a-zA-Z0-9_.-]+)"`, "m").exec(config)?.[1] ?? fallback;
  return ["exec", "--sandbox", sandbox, "--ephemeral", "--json", ...(schema ? ["--output-schema", schema] : []), "-c", `model_reasoning_effort="${effort}"`, "-c", 'approval_policy="never"', "-c", `model_provider="${setting("model_provider", "amazon-bedrock")}"`, "--model", setting("model", "openai.gpt-6.1-sol"), "-"];
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
  return new Promise(resolveRun => {
    let output = "", buffer = "", bytes = 0, reason: string | undefined, closed = false;
    let child: ReturnType<typeof spawn>;
    const finish = (code: number | null) => { if (closed) return; closed = true; clearTimeout(timer); o.signal?.removeEventListener("abort", abort); resolveRun({ output, code, ...(reason ? { reason } : {}) }); };
    const kill = (why: string) => { if (reason) return; reason = why; o.onKill?.(); try { if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL"); else child.kill("SIGKILL"); } catch {} };
    const abort = () => kill("cancelled");
    const timer = setTimeout(() => kill("timeout"), o.timeoutMs);
    try { child = spawn(o.bin, o.args, { cwd: o.cwd, env: o.env, shell: false, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"] }); }
    catch { reason = "start"; finish(null); return; }
    o.signal?.addEventListener("abort", abort, { once: true }); if (o.signal?.aborted) abort();
    child.stdout!.setEncoding("utf8"); child.stdout!.on("data", (chunk: string) => {
      bytes += Buffer.byteLength(chunk); if (bytes > o.maxBytes) { kill("output-limit"); return; }
      output += chunk; buffer += chunk; let i: number;
      while ((i = buffer.indexOf("\n")) >= 0) { try { o.onLine?.(buffer.slice(0,i)); } catch { kill("invalid-output"); } buffer = buffer.slice(i+1); }
    });
    child.stderr!.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > o.maxBytes) kill("output-limit"); });
    child.stdin!.on("error", () => {}); child.once("error", () => { reason ??= "start"; });
    child.once("close", code => { if (buffer.trim()) try { o.onLine?.(buffer); } catch { reason ??= "invalid-output"; } finish(code); });
    child.stdin!.end(o.input);
  });
}

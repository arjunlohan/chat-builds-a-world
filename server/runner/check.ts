import { writeFile, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { runBounded, minimalEnvironment } from "../runtime/process.js";
export interface CheckResult { ok: boolean; reason?: string; fps?: number; avgFps?: number; samples?: number; durationMs?: number }
export async function candidateCheck(root: string, modules: { id: string; file: string; code: string }[], probeId: string, signal: AbortSignal): Promise<CheckResult> {
  const started = performance.now(), directory = join(root, "state/checks"); await mkdir(directory, { recursive: true });
  const input = join(directory, `${randomUUID()}.json`); await writeFile(input, JSON.stringify({ modules, probeId }), { mode: 0o600 });
  let browserPid=0;
  try {
    const raw=await runBounded({ bin:process.execPath,args:["--import","tsx",fileURLToPath(new URL("../../checks/candidate.worker.ts",import.meta.url)),input],cwd:resolve(fileURLToPath(new URL("../..",import.meta.url))),env:minimalEnvironment(process.env),signal,timeoutMs:24_000,maxBytes:65536,
      onLine(line){try{const event=JSON.parse(line) as {browserPid?:number};if(Number.isSafeInteger(event.browserPid))browserPid=event.browserPid!;}catch{}},
      onKill(){if(browserPid)try{process.kill(process.platform==="win32"?browserPid:-browserPid,"SIGKILL");}catch{}}
    });
    let result:CheckResult={ok:false,reason:"Candidate checker failed."};
    if(raw.reason)result.reason=raw.reason==="timeout"?"Candidate exceeded its 25-second external watchdog.":raw.reason==="cancelled"?"Candidate check cancelled.":"Candidate checker could not complete.";
    else{try{result=JSON.parse(raw.output.trim().split("\n").at(-1)!) as CheckResult;}catch{}if(raw.code!==0&&result.ok)result={ok:false,reason:"Candidate checker failed."};}
    return {...result,durationMs:Math.round(performance.now()-started)};
  }finally{await rm(input,{force:true});}
}

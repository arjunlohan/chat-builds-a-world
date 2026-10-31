import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { runBounded, minimalEnvironment, drainGroup, boundedFailure } from "../runtime/process.js";
export interface CheckResult { ok: boolean; reason?: string; fps?: number; avgFps?: number; samples?: number; durationMs?: number; evidence?: string }
export async function candidateCheck(root: string, modules: { id: string; file: string; code: string }[], probeId: string, signal: AbortSignal): Promise<CheckResult> {
  const started = performance.now(), directory = join(root, "state/checks"); await mkdir(directory, { recursive: true });
  const evidence=join(directory,randomUUID());await mkdir(evidence,{recursive:true});
  const input = join(evidence, "input.json"); await writeFile(input, JSON.stringify({ modules, probeId }), { mode: 0o600 });
  let browserPid=0;
  // Evidence is deliberately retained on success, failure, cancellation and watchdog termination.
    const raw=await runBounded({ bin:process.execPath,args:["--import","tsx",fileURLToPath(new URL("../../checks/candidate.worker.ts",import.meta.url)),input],cwd:resolve(fileURLToPath(new URL("../..",import.meta.url))),env:minimalEnvironment(process.env),signal,timeoutMs:24_000,maxBytes:65536,
      onLine(line){try{const event=JSON.parse(line) as {browserPid?:number};if(Number.isSafeInteger(event.browserPid))browserPid=event.browserPid!;}catch{}},
      onKill(){if(browserPid)return drainGroup(browserPid);}
    });
    let result:CheckResult={ok:false,reason:"Candidate checker failed."};
    if(raw.reason)result.reason=boundedFailure(raw.reason,"Candidate checker",24);
    else{try{result=JSON.parse(raw.output.trim().split("\n").at(-1)!) as CheckResult;}catch{}if(raw.code!==0&&result.ok)result={ok:false,reason:"Candidate checker failed."};}
    const final={...result,evidence,durationMs:Math.round(performance.now()-started)};
    await writeFile(join(evidence,"result.json"),JSON.stringify(final,null,2),{mode:0o600});return final;
}

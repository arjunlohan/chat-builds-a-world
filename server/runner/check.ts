import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {jsonWorker} from "../runtime/json-worker.js";
import {isGateVerdict,infrastructureFailed,type GateVerdict} from "./verdict.js";
export const CHECK_TIMEOUT_MS=24_000;
export type CheckResult=GateVerdict&{fps?: number; avgFps?: number; samples?: number; durationMs?: number; evidence?: string};
export async function candidateCheck(root: string, modules: { id: string; file: string; code: string }[], probeId: string, signal: AbortSignal): Promise<CheckResult> {
  const started = performance.now(), directory = join(root, "state/checks"); await mkdir(directory, { recursive: true });
  const evidence=join(directory,randomUUID());await mkdir(evidence,{recursive:true});
  const input = join(evidence, "input.json"); await writeFile(input, JSON.stringify({ modules, probeId }), { mode: 0o600 });
  // Evidence is deliberately retained on success, failure, cancellation and watchdog termination.
    const raw=await jsonWorker<CheckResult>({script:fileURLToPath(new URL("../../checks/candidate.worker.ts",import.meta.url)),args:[input],signal,timeoutMs:CHECK_TIMEOUT_MS,verdict:isGateVerdict});
    const result:CheckResult=raw.verdict??infrastructureFailed(`Candidate checker ${raw.error}`);
    const final={...result,evidence,durationMs:Math.round(performance.now()-started)};
    await writeFile(join(evidence,"result.json"),JSON.stringify(final,null,2),{mode:0o600});return final;
}

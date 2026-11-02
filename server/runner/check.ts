import type {ModelName} from "../../world/shared/model-kit.js";
import type {WorldLook} from "../../world/engine/render-profile.js";
import {CANDIDATE_THRESHOLDS} from "../../checks/candidate-policy.js";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {jsonWorker} from "../runtime/json-worker.js";
import {isGateVerdict,infrastructureFailed,type GateVerdict} from "./verdict.js";
import {GateBrowser} from './gate-browser.js';
export const CHECK_TIMEOUT_MS=CANDIDATE_THRESHOLDS.watchdogMs;
export type CheckResult=GateVerdict&{fps?: number; rawFps?:number; baselineFps?:number;fpsDropRatio?:number;moduleP95Ms?:number;addedRenderMs?:number; avgFps?: number; samples?: number; durationMs?: number; evidence?: string;nativeWarmupMs?:number;browserWarmupMs?:number;browserWaitMs?:number};
export async function candidateCheck(root: string, modules: { id: string; file: string; code: string;modelKinds?:readonly ModelName[] }[], probeId: string, signal: AbortSignal, commands:readonly string[]=[],look:WorldLook=process.env.WORLD_LOOK==="classic"?"classic":"new",shared?:GateBrowser,watchdogMs:number=CHECK_TIMEOUT_MS): Promise<CheckResult> {
  const started = performance.now(), directory = join(root, "state/checks"); await mkdir(directory, { recursive: true });
  const evidence=join(directory,randomUUID());await mkdir(evidence,{recursive:true});
  const pool=shared??new GateBrowser();let browserWarmupMs=0,browserWaitMs=0;
  try{
  const prepared=await pool.prepare();browserWarmupMs=prepared.warmupMs;browserWaitMs=performance.now()-started;
  const input = join(evidence, "input.json"); await writeFile(input, JSON.stringify({ modules, probeId, commands, look,browserEndpoint:prepared.endpoint,browserPort:prepared.port }), { mode: 0o600 });
  // Evidence is deliberately retained on success, failure, cancellation and watchdog termination.
    const raw=await jsonWorker<CheckResult>({script:fileURLToPath(new URL("../../checks/candidate.worker.ts",import.meta.url)),args:[input],signal,timeoutMs:Math.max(1,Math.max(CHECK_TIMEOUT_MS,watchdogMs)-(performance.now()-started)),verdict:isGateVerdict});
    const result:CheckResult=raw.verdict??infrastructureFailed(`Candidate checker ${raw.error}`);
    if(!raw.verdict)await pool.reset();
    const final={...result,browserWarmupMs,browserWaitMs,evidence,durationMs:Math.round(performance.now()-started)};
    await writeFile(join(evidence,"result.json"),JSON.stringify(final,null,2),{mode:0o600});return final;
  }catch{await pool.reset();return {...infrastructureFailed('Candidate browser could not prepare.'),browserWarmupMs,browserWaitMs,evidence,durationMs:Math.round(performance.now()-started)};}
  finally{if(shared)await pool.release();else await pool.close();}
}

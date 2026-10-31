import type { RunResult } from "../runner/index.js";
import type { Usage } from "../runner/events.js";
import type { GuardResult } from "../guard/index.js";
export const reverted = (reason: string, durationMs=0, tokens: Usage={input:null,output:null,total:null}): RunResult => ({ok:false,outcome:"REVERTED",reason,durationMs,tokens});
export const rejected = (reason: string, mode: GuardResult["mode"], latencyMs=0, title="Idea rejected"): GuardResult => ({verdict:"reject",reason,title,spec:null,files:[],latencyMs,mode});

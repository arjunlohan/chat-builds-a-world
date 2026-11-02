import {inspectModule} from "./policy.js";
import {chatCommands} from "./chat-play.js";
import {stopOrphan} from "./recovery.js";
import { ACTIVE_MODULE_CAP } from "../../world/shared/limits.js";
import { reverted } from "../runtime/results.js";
import { OperationQueue } from "../runtime/queue.js";
import { protectedValues, redact } from "../runtime/process.js";
import { metricWriter } from "../runtime/metrics.js";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { validateDecision, type GuardResult } from "../guard/index.js";
import { Versions, type WorldVersion } from "../versions/index.js";
import { auditDiff, discardUnshippedTag, cleanMaster, commitTree, createTree, git, inventory, promote, removeTree, validateTree } from "./git.js";
import { runCodex, runnerPrompt, BUILD_TIMEOUT_MS } from "./codex.js";
import { candidateCheck, CHECK_TIMEOUT_MS, type CheckResult } from "./check.js";
import {selfCheck,selfCheckCommand,selfCheckManifest,resourceCheck,SELF_CHECK_TIMEOUT_MS,RESOURCE_STARTUP_TIMEOUT_MS,type ResourceContext} from "./self-check.js";
import {GateBrowser} from './gate-browser.js';
import {CANDIDATE_THRESHOLDS} from "../../checks/candidate-policy.js";
import type { Usage } from "./events.js";
export interface BuildRequest { decision: GuardResult; requester: string; signal: AbortSignal }
export interface RunResult { ok: boolean; outcome: "SHIPPED" | "REVERTED" | "ROLLED BACK"; reason: string; durationMs: number; builderMs?: number; attempts?:number;firstReason?:string;tokens: Usage; version?: number; tag?: string; check?: CheckResult }
class RepairableRejection extends Error {}
export const BUILD_ATTEMPTS=2;
export const BUILD_HANDOFF_MS=2000;
export const BUILD_CHECK_RESERVE_MS=RESOURCE_STARTUP_TIMEOUT_MS+SELF_CHECK_TIMEOUT_MS+CHECK_TIMEOUT_MS+BUILD_HANDOFF_MS;
export function builderAllowance(remainingMs:number){return Math.max(0,remainingMs-BUILD_CHECK_RESERVE_MS);}
export function requireGateTime(remainingMs:number,firstReason?:string){if(remainingMs<CHECK_TIMEOUT_MS)throw new Error(firstReason??"Insufficient time remaining for the complete candidate gate.");return Math.max(CHECK_TIMEOUT_MS,remainingMs-BUILD_HANDOFF_MS);}
interface Options {
  root: string; versions: Versions; bin?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number;
  feed(kind: "plan" | "edit" | "check" | "ship" | "error", text: string): void;
  announce(message: string): Promise<void>;
  check?: typeof candidateCheck;
  builder?: typeof runCodex;
  record?: (record: unknown) => Promise<void> | void;
}
export class Runner {
  private readonly gateBrowser=new GateBrowser();
  private readonly queue = new OperationQueue();
  private readonly record: NonNullable<Options["record"]>;
  readonly root: string;
  constructor(private options: Options) { this.root = resolve(options.root); this.record = options.record ?? metricWriter(join(this.root, "state"), "runner-metrics.jsonl"); }
  async prepareChecks(){await this.gateBrowser.prepare();}
  async close(){await this.queue.close();await this.gateBrowser.close();}
  async recover() {

      const pending=this.options.versions.pending,current=this.options.versions.current;
      if(pending)await validateTree(this.root,pending.path,pending.version);
      if(pending?.process&&pending.owner)await stopOrphan(pending.process,pending.owner,pending.path);
      if(pending)await discardUnshippedTag(this.root,pending.version);
      const head=await git(this.root,"rev-parse","master"),advanced=!!pending&&head!==pending.base;
      if(advanced||current?.healthy===false){
        const tag=`v${advanced?pending!.version:current!.version}`,tagHead=await git(this.root,"rev-parse",`refs/tags/${tag}`).catch(()=>"");
        if(head!==tagHead)throw new Error("Master advanced outside the interrupted run; recovery left it unchanged.");
        await cleanMaster(this.root);
        const target=this.options.versions.fallbackTarget({excludingCommit:head,allowBaseline:true});if(!target)throw new Error("No known-good version is available for recovery.");
        if(pending)await removeTree(this.root,pending.path);
        await this.restoreForward(head,target,"Recovered previous world","system",false);
      }else if(pending)await removeTree(this.root,pending.path);
      await this.options.versions.setPending();
  }
  private async reserve() {
    const tags = (await git(this.root, "tag", "--list", "v*")).split("\n").filter(tag => /^v[1-9][0-9]*$/.test(tag)).map(tag => Number(tag.slice(1)));
    return this.options.versions.reserve(Math.max(0, ...tags) + 1);
  }
  private async log(result: RunResult, mode: string) {
    try { await this.record({ at: Date.now(), mode, ...result }); } catch { /* Metrics are never part of promotion or recovery. */ }
  }
  async build(request: BuildRequest): Promise<RunResult> {
    return this.queue.enqueue(signal => this.buildNow({ ...request, signal: AbortSignal.any([signal, request.signal]) }));
  }
  private async buildNow(request: BuildRequest): Promise<RunResult> {
    const start = performance.now(), controller = new AbortController();
    const cancel = () => controller.abort(); request.signal.addEventListener("abort", cancel, { once: true });
    if (request.signal.aborted) controller.abort(); const signal = controller.signal;
    const budget=Math.min(this.options.timeoutMs??BUILD_TIMEOUT_MS,BUILD_TIMEOUT_MS),deadline=start+budget;
    const timer = setTimeout(() => controller.abort(),budget);
    let builderMs = 0,attempts=0,firstReason:string|undefined;
    let tree = "", version = 0, merged = false, base = "", check: CheckResult | undefined;
    let tokens: Usage = { input: null, output: null, total: null };
    const requester = request.requester.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 64) || "viewer";
    const feed = this.options.feed;
    try {
      const { latencyMs: _latency, mode: _mode, reviewed: _reviewed, ...data } = request.decision;
      const approved = await validateDecision(data, this.root);
      if (approved.verdict !== "accept" || !approved.spec) throw new Error("Only guard-accepted specs can build.");
      const baseUsage=this.options.versions.baseUsage;
      if(!baseUsage)throw new Error("World resource baseline is unknown; open /world before building.");
      const retained=(this.options.versions.current?.modules??[]).filter(m=>m.id!==approved.spec!.moduleId);
      if(retained.length+1>ACTIVE_MODULE_CAP)throw new Error(`${ACTIVE_MODULE_CAP} active modules maximum; replace or roll back an existing module first.`);
      base = await cleanMaster(this.root); await this.options.versions.baselineAt(base); version = await this.reserve();
      tree = await createTree(this.root, version, base); await this.options.versions.setPending({ path: tree, base, version });
      const before = await inventory(tree); feed("plan", `Created isolated worktree v${version}.`);
      const sourceEnv = this.options.env ?? process.env;
      const context:ResourceContext={base:baseUsage,retained:retained.map(m=>({...m,code:this.options.versions.bundle(m.hash)!}))};
      const input={...context,file:approved.files[0]!,id:approved.spec.moduleId,files:approved.files};
      const manifest=await selfCheckManifest(this.root,input),command=selfCheckCommand(manifest);
      // Probe retained allocations through the same resource ledger, without renderer work.
      const existing=await resourceCheck(context,context.retained,signal);
      if(!existing.ok)throw new Error(existing.reason??"Retained world resource check failed.");
      let modules:ResourceContext["retained"]=[];
      const addTokens=(next:Usage)=>{for(const key of ["input","output","total"] as const)tokens[key]=attempts===1?next[key]:tokens[key]===null||next[key]===null?null:tokens[key]!+next[key]!;};
      for(let attempt=1;attempt<=BUILD_ATTEMPTS;attempt++){
        if(signal.aborted||performance.now()>=deadline)throw new Error("Build timed out or was cancelled.");
        const allowance=builderAllowance(deadline-performance.now());
        if(allowance<1000)throw new Error(firstReason??"Insufficient time remaining for builder, self-check and candidate gate.");
        check=undefined;
        const prompt=await runnerPrompt(this.root,approved,{command,resources:{base:baseUsage,...existing},...(firstReason?{rejection:firstReason}:{})});
        const builderStart=performance.now();let diagnostic:string|undefined;attempts=attempt;
        try{const built=await (this.options.builder??runCodex)({root:this.root,tree,bin:this.options.bin??sourceEnv.CODEX_BIN??"codex",env:sourceEnv,decision:approved,signal,feed,prompt,attempt,timeoutMs:builderAllowance(deadline-performance.now()),onSpawn:async pid=>{await this.options.versions.setPending({path:tree,base,version,process:pid,owner:process.pid});}});addTokens(built);diagnostic=built.diagnostic;}
        catch(error){const used=(error as {tokens?:Usage})?.tokens;addTokens(used??{input:null,output:null,total:null});if(firstReason&&!request.signal.aborted&&builderAllowance(deadline-performance.now())<1000)throw new Error(firstReason);throw error;}
        finally{builderMs+=Math.round(performance.now()-builderStart);}
        // Path and protected-data violations are never repairable. Always compare to the original inventory.
        try{await auditDiff(tree,base,before,approved.files);}catch(error){if(error instanceof Error&&error.message==="Builder produced no module changes.")throw new Error(`${error.message} ${diagnostic??"Builder returned no explanation."}`);throw error;}
        const secrets=protectedValues(sourceEnv);
        for(const file of approved.files){const source=await readFile(join(tree,file),"utf8");if(secrets.some(value=>source.includes(value)))throw new Error("Candidate contained protected data.");}
        try{
          feed("check",`Attempt ${attempt}: approved paths verified; policy, types and resources.`);
          const checked=await selfCheck(tree,input,signal);
          if(!checked.resources.ok){if(checked.resources.category!=="candidate"||checked.resources.retryable!==true)throw new Error(checked.resources.reason);throw new RepairableRejection(checked.resources.reason);}
          modules=checked.modules;
          const discovered=await Promise.all(approved.files.map(async file=>inspectModule(await readFile(join(tree,file),"utf8"),file)));
          const commands=chatCommands(approved.spec,discovered.flatMap(found=>found.commands));
          if(discovered.some(found=>found.hasOnChatLogic)&&!commands.length)feed("check","Module has onChat logic but no testable custom !command; built-in commands are excluded.");
          feed("check",`SwiftShader · ${CANDIDATE_THRESHOLDS.slicePairs} paired ${CANDIDATE_THRESHOLDS.sliceFrames}-frame cost slices and full-look probes · attempt ${attempt}.`);
          const watchdogMs=requireGateTime(deadline-performance.now(),firstReason);
          check=await (this.options.check??candidateCheck)(this.root,modules,approved.spec.moduleId,signal,commands,this.options.versions.renderLook??(sourceEnv.WORLD_LOOK==="classic"?"classic":"new"),this.gateBrowser,watchdogMs);
          // A background conflict copy or hostile edit stays fatal even when another gate fails.
          await auditDiff(tree,base,before,approved.files);
          if(!check.ok){if(check.category!=="candidate"||check.retryable!==true)throw new Error(check.reason);throw new RepairableRejection(check.reason);}
          break;
        }catch(error){
          if(!(error instanceof RepairableRejection)||attempt===BUILD_ATTEMPTS||signal.aborted||builderAllowance(deadline-performance.now())<1000)throw error;
          await auditDiff(tree,base,before,approved.files);
          firstReason=redact(error.message,protectedValues(sourceEnv));
          feed("plan",`Retry ${attempt+1}/${BUILD_ATTEMPTS} · ${firstReason}`);
        }
      }
      if (signal.aborted) throw new Error("Build timed out or was cancelled.");
      const message = `v${version}: ${approved.title} (requested by @${requester})`;
      const commit = await commitTree(tree, message);
      if (signal.aborted) throw new Error("Build timed out or was cancelled.");
      const artifacts = await Promise.all(modules.map(m => this.options.versions.artifact(m.id, m.file, m.code,m.modelKinds)));
      await promote(this.root, base, commit, `v${version}`); merged = true;
      if (signal.aborted) throw new Error("Build timed out or was cancelled.");
      feed("ship", `v${version} checked; activating without a page reload.`);
      const active = await this.options.versions.activate({ version, tag: `v${version}`, commit, title: approved.title, requester, modules: artifacts });
      if (!active) throw new Error("Live activation did not acknowledge; restoring the previous world.");
      const result: RunResult = { ok: true, outcome: "SHIPPED", reason: "Checks passed and live module swap acknowledged.", attempts,...(firstReason?{firstReason}:{}),builderMs, durationMs: Math.round(performance.now() - start), tokens, version, tag: `v${version}`, ...(check?{check}:{}) };
      await this.log(result, request.decision.mode);
      try { await this.options.announce(`Shipped v${version}: ${approved.title} · requested by @${requester}`); } catch { feed("check", "Shipped; Twitch announcement unavailable."); } return result;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Build failed.";
      const reason = signal.aborted ? (request.signal.aborted?"Build timed out or was cancelled.":firstReason??"Build timed out or was cancelled.") : redact(detail, protectedValues(this.options.env ?? process.env));
      if (merged && tree) {
        const head=await git(this.root,"rev-parse","master"),target=this.options.versions.fallbackTarget({excludingCommit:head,allowBaseline:true});if(!target)throw new Error("No healthy world is available for restoration.");
        await this.restoreForward(head,target,"Automatic revert",requester,false);
      }
      feed("error", `REVERTED · ${reason}`);
      const result: RunResult = { ...reverted(reason,Math.round(performance.now()-start),tokens), builderMs,attempts,...(firstReason?{firstReason}:{}), ...(check?{check}:{}) };
      await this.log(result, request.decision.mode); return result;
    } finally {
      clearTimeout(timer); request.signal.removeEventListener("abort", cancel); controller.abort();
      try { if (tree) await removeTree(this.root, tree); } finally { await this.options.versions.setPending(); }
    }
  }
  async rollback(requester: string, automatic = false): Promise<RunResult> {
    return this.queue.enqueue(() => this.rollbackNow(requester, automatic), automatic);
  }
  private async rollbackNow(requester: string, automatic: boolean): Promise<RunResult> {
    const start = performance.now(), target = this.options.versions.fallbackTarget({allowBaseline:automatic}), tokens = { input: 0, output: 0, total: 0 };
    if (!target) return reverted("No previous tag to restore.",0,tokens);
    try {
      const base = await cleanMaster(this.root);
      const version = await this.restoreForward(base,target,`Restore ${target.tag}`,requester);
      const result: RunResult = { ok: true, outcome: "ROLLED BACK", reason: `Restored ${target.tag} without resetting master.`, version, tag: `v${version}`, durationMs: Math.round(performance.now() - start), tokens };
      this.options.feed("ship", `Restored ${target.tag}.`); await this.log(result, "rollback"); try { await this.options.announce(`Rolled back to ${target.tag}.`); } catch { this.options.feed("check", "Restored; Twitch announcement unavailable."); } return result;
    } catch (error) { const result: RunResult = reverted(redact(error instanceof Error ? error.message : "Rollback failed.",protectedValues(this.options.env??process.env)),Math.round(performance.now()-start),tokens); await this.log(result, "rollback"); return result; }

  }
  private async restoreForward(base:string,target:Pick<WorldVersion,"commit"|"tag"|"modules">,title:string,requester:string,wait=true){
    const version=await this.reserve(),tree=await createTree(this.root,version,base);
    await this.options.versions.setPending({path:tree,base,version});
    try{
      await git(tree,"restore","--source",target.commit,"--staged","--worktree","--","world/modules");
      const commit=await commitTree(tree,`v${version}: ${title} (requested by @${requester})`);
      await promote(this.root,base,commit,`v${version}`);
      const ok=await this.options.versions.activate({version,tag:`v${version}`,commit,title,requester,modules:target.modules,restoredFrom:target.tag},wait);
      if(!ok)throw new Error("Restoration activation did not acknowledge.");
      return version;
    }finally{await removeTree(this.root,tree);await this.options.versions.setPending();}
  }

}

import {withLock} from "../runtime/lock.js";
import {stopOrphan} from "./recovery.js";
import { ACTIVE_MODULE_CAP } from "../../world/shared/limits.js";
import { reverted } from "../runtime/results.js";
import { OperationQueue } from "../runtime/queue.js";
import { protectedValues, redact } from "../runtime/process.js";
import { metricWriter } from "../runtime/metrics.js";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDecision, type GuardResult } from "../guard/index.js";
import { Versions, type WorldVersion } from "../versions/index.js";
import { auditDiff, cleanMaster, commitTree, createTree, git, inventory, promote, removeTree } from "./git.js";
import { compileModule } from "./policy.js";
import { runCodex, BUILD_TIMEOUT_MS } from "./codex.js";
import { candidateCheck, type CheckResult } from "./check.js";
import type { Usage } from "./events.js";
export interface BuildRequest { decision: GuardResult; requester: string; signal: AbortSignal }
export interface RunResult { ok: boolean; outcome: "SHIPPED" | "REVERTED" | "ROLLED BACK"; reason: string; durationMs: number; builderMs?: number; tokens: Usage; version?: number; tag?: string; check?: CheckResult }
interface Options {
  root: string; versions: Versions; bin?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number;
  feed(kind: "plan" | "edit" | "check" | "ship" | "error", text: string): void;
  announce(message: string): Promise<void>;
  check?: typeof candidateCheck;
  builder?: typeof runCodex;
  record?: (record: unknown) => Promise<void> | void;
}
export class Runner {
  private readonly queue = new OperationQueue();
  private readonly record: NonNullable<Options["record"]>;
  readonly root: string;
  constructor(private options: Options) { this.root = resolve(options.root); this.record = options.record ?? metricWriter(join(this.root, "state"), "runner-metrics.jsonl"); }
  async close(){await this.queue.close();}
  async recover() {
    await withLock(this.root,async()=>{
      const pending=this.options.versions.pending,current=this.options.versions.current;
      if(pending&&pending.path!==join(this.root,"worktrees",`v${pending.version}`))throw new Error("Invalid pending worktree recovery path.");
      if(pending?.process&&pending.owner)await stopOrphan(pending.process,pending.owner,pending.path);
      const head=await git(this.root,"rev-parse","master"),advanced=!!pending&&head!==pending.base;
      if(advanced||current?.healthy===false){
        const tag=`v${advanced?pending!.version:current!.version}`,tagHead=await git(this.root,"rev-parse",`refs/tags/${tag}`).catch(()=>"");
        if(head!==tagHead)throw new Error("Master advanced outside the interrupted run; recovery left it unchanged.");
        await cleanMaster(this.root);
        const target=(current?.healthy===true?current:this.options.versions.previous())??(this.options.versions.baseline?{commit:this.options.versions.baseline,tag:"v0",modules:[]}:null);if(!target)throw new Error("No known-good version is available for recovery.");
        if(pending)await removeTree(this.root,pending.path);
        const version=await this.reserve(),tree=await createTree(this.root,version,head);await this.options.versions.setPending({path:tree,base:head,version});
        try{await git(tree,"restore","--source",target.commit,"--staged","--worktree","--","world/modules");const commit=await commitTree(tree,`v${version}: recover interrupted activation`);await promote(this.root,head,commit,`v${version}`);await this.options.versions.activate({version,tag:`v${version}`,commit,title:"Recovered previous world",requester:"system",modules:target.modules,restoredFrom:target.tag},false);}finally{await removeTree(this.root,tree);}
      }else if(pending)await removeTree(this.root,pending.path);
      await this.options.versions.setPending();
    });
  }
  private async reserve() {
    const tags = (await git(this.root, "tag", "--list", "v*")).split("\n").filter(tag => /^v[1-9][0-9]*$/.test(tag)).map(tag => Number(tag.slice(1)));
    return this.options.versions.reserve(Math.max(0, ...tags) + 1);
  }
  private async log(result: RunResult, mode: string) {
    try { await this.record({ at: Date.now(), mode, ...result }); } catch { /* Metrics are never part of promotion or recovery. */ }
  }
  async build(request: BuildRequest): Promise<RunResult> {
    return this.queue.enqueue(signal => withLock(this.root,()=>this.buildNow({ ...request, signal: AbortSignal.any([signal, request.signal]) })).catch(error=>reverted(redact(error instanceof Error?error.message:"Build lock unavailable.",protectedValues(this.options.env??process.env)))));
  }
  private async buildNow(request: BuildRequest): Promise<RunResult> {
    const start = performance.now(), controller = new AbortController();
    const cancel = () => controller.abort(); request.signal.addEventListener("abort", cancel, { once: true });
    if (request.signal.aborted) controller.abort(); const signal = controller.signal;
    const timer = setTimeout(() => controller.abort(), Math.min(this.options.timeoutMs ?? BUILD_TIMEOUT_MS, BUILD_TIMEOUT_MS));
    let builderMs = 0;
    let tree = "", version = 0, merged = false, base = "", check: CheckResult | undefined;
    let tokens: Usage = { input: null, output: null, total: null };
    const requester = request.requester.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 64) || "viewer";
    const previous = this.options.versions.current;
    const feed = this.options.feed;
    try {
      const { latencyMs: _latency, mode: _mode, reviewed: _reviewed, ...data } = request.decision;
      const approved = await validateDecision(data, this.root);
      if (approved.verdict !== "accept" || !approved.spec) throw new Error("Only guard-accepted specs can build.");
      base = await cleanMaster(this.root); await this.options.versions.baselineAt(base); version = await this.reserve();
      tree = await createTree(this.root, version, base); await this.options.versions.setPending({ path: tree, base, version });
      const before = await inventory(tree); feed("plan", `Created isolated worktree v${version}.`);
      const sourceEnv = this.options.env ?? process.env;
      const builderStart = performance.now();
      try { tokens = await (this.options.builder ?? runCodex)({ root: this.root, tree, bin: this.options.bin ?? sourceEnv.CODEX_BIN ?? "codex", env: sourceEnv, decision: approved, signal, feed, onSpawn:async pid=>{await this.options.versions.setPending({path:tree,base,version,process:pid,owner:process.pid});}, ...(this.options.timeoutMs ? { timeoutMs: this.options.timeoutMs } : {}) }); } finally { builderMs = Math.round(performance.now()-builderStart); }
      await auditDiff(tree, base, before, approved.files); feed("check", "Approved paths verified; compiling the candidate.");
      const secrets = protectedValues(sourceEnv);
      for (const file of approved.files) {
        const source = await readFile(join(tree, file), "utf8");
        if (secrets.some(value => source.includes(value))) throw new Error("Candidate contained protected data.");
      }
      const nodeModules = fileURLToPath(new URL("../../node_modules", import.meta.url));
      const compiled = await compileModule(tree, approved.files[0]!, approved.spec.moduleId, nodeModules, approved.files);
      const retained = (previous?.modules ?? []).filter(m => m.id !== compiled.id);
      const modules = [...retained.map(m => ({ ...m, code: this.options.versions.bundle(m.hash)! })), { ...compiled, file: approved.files[0]! }];
      if (modules.length > ACTIVE_MODULE_CAP) throw new Error("Eight active modules maximum.");
      feed("check", "SwiftShader · 300 citizens · 15-second candidate gate.");
      check = await (this.options.check ?? candidateCheck)(this.root, modules, compiled.id, signal);
      if (!check.ok) throw new Error(check.reason ?? "Candidate gate failed.");
      await auditDiff(tree, base, before, approved.files);
      if (signal.aborted) throw new Error("Build timed out or was cancelled.");
      const message = `v${version}: ${approved.title} (requested by @${requester})`;
      const commit = await commitTree(tree, message);
      if (signal.aborted) throw new Error("Build timed out or was cancelled.");
      const artifacts = await Promise.all(modules.map(m => this.options.versions.artifact(m.id, m.file, m.code)));
      await promote(this.root, base, commit, `v${version}`); merged = true;
      if (signal.aborted) throw new Error("Build timed out or was cancelled.");
      feed("ship", `v${version} checked; activating without a page reload.`);
      const active = await this.options.versions.activate({ version, tag: `v${version}`, commit, title: approved.title, requester, modules: artifacts });
      if (!active) throw new Error("Live activation did not acknowledge; restoring the previous world.");
      const result: RunResult = { ok: true, outcome: "SHIPPED", reason: "Checks passed and live module swap acknowledged.", builderMs, durationMs: Math.round(performance.now() - start), tokens, version, tag: `v${version}`, check };
      await this.log(result, request.decision.mode);
      try { await this.options.announce(`Shipped v${version}: ${approved.title} — requested by @${requester}`); } catch { feed("check", "Shipped; Twitch announcement unavailable."); } return result;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Build failed.";
      tokens = (error as { tokens?: Usage })?.tokens ?? tokens;
      const reason = signal.aborted ? "Build timed out or was cancelled." : redact(detail, protectedValues(this.options.env ?? process.env));
      if (merged && tree) {
        // Recovery is another forward commit, never a reset of the session checkout.
        await git(tree, "restore", "--source", base, "--staged", "--worktree", "--", "world/modules");
        const restored = await commitTree(tree, `Revert v${version}: activation failed`), next = version + 1;
        await promote(this.root, await git(this.root, "rev-parse", "master"), restored, `v${next}`);
        await this.options.versions.activate({ version: next, tag: `v${next}`, commit: restored, title: "Automatic revert", requester, modules: previous?.modules ?? [], restoredFrom: previous?.tag ?? "v0" }, false);
      }
      feed("error", `REVERTED · ${reason}`);
      const result: RunResult = { ...reverted(reason,Math.round(performance.now()-start),tokens), builderMs, ...(check?{check}:{}) };
      await this.log(result, request.decision.mode); return result;
    } finally {
      clearTimeout(timer); request.signal.removeEventListener("abort", cancel); controller.abort();
      try { if (tree) await removeTree(this.root, tree); } finally { await this.options.versions.setPending(); }
    }
  }
  async rollback(requester: string, automatic = false): Promise<RunResult> {
    return this.queue.enqueue(() => withLock(this.root,()=>this.rollbackNow(requester, automatic)).catch(error=>reverted(error instanceof Error?error.message:"Rollback lock unavailable.")), automatic);
  }
  private async rollbackNow(requester: string, automatic: boolean): Promise<RunResult> {
    const baseline = this.options.versions.baseline;
    const start = performance.now(), target = this.options.versions.previous() ?? (automatic && baseline ? { version: 0, tag: "v0", commit: baseline, title: "Original world", requester: "system", modules: [], receipt: "" } : null), tokens = { input: 0, output: 0, total: 0 };
    if (!target) return reverted("No previous tag to restore.",0,tokens);
    let tree = "";
    try {
      const base = await cleanMaster(this.root), version = await this.reserve();
      tree = await createTree(this.root, version, base); await this.options.versions.setPending({ path: tree, base, version });
      await git(tree, "restore", "--source", target.commit, "--staged", "--worktree", "--", "world/modules");
      const commit = await commitTree(tree, `v${version}: restore ${target.tag} (requested by @${requester})`);
      await promote(this.root, base, commit, `v${version}`);
      const ok = await this.options.versions.activate({ version, tag: `v${version}`, commit, title: `Restore ${target.tag}`, requester, modules: target.modules, restoredFrom: target.tag });
      if (!ok) throw new Error("Rollback activation did not acknowledge.");
      const result: RunResult = { ok: true, outcome: "ROLLED BACK", reason: `Restored ${target.tag} without resetting master.`, version, tag: `v${version}`, durationMs: Math.round(performance.now() - start), tokens };
      this.options.feed("ship", `Restored ${target.tag}.`); await this.log(result, "rollback"); try { await this.options.announce(`Rolled back to ${target.tag}.`); } catch { this.options.feed("check", "Restored; Twitch announcement unavailable."); } return result;
    } catch (error) { const result: RunResult = reverted(redact(error instanceof Error ? error.message : "Rollback failed.",protectedValues(this.options.env??process.env)),Math.round(performance.now()-start),tokens); await this.log(result, "rollback"); return result; }
    finally { if (tree) await removeTree(this.root, tree); await this.options.versions.setPending(); }
  }
}

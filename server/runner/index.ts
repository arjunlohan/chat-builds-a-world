import { appendFile, mkdir, readFile } from "node:fs/promises";
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
export interface RunResult { ok: boolean; outcome: "SHIPPED" | "REVERTED" | "ROLLED BACK"; reason: string; durationMs: number; tokens: Usage; version?: number; tag?: string; check?: CheckResult }
interface Options {
  root: string; versions: Versions; bin?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number;
  feed(kind: "plan" | "edit" | "check" | "ship" | "error", text: string): void;
  announce(message: string): Promise<void>;
  check?: typeof candidateCheck;
}
export class Runner {
  private busy = false;
  readonly root: string;
  constructor(private options: Options) { this.root = resolve(options.root); }
  get isBusy() { return this.busy; }
  async recover() {
    const pending = this.options.versions.pending;
    if (pending && pending.path === join(this.root, "worktrees", `v${pending.version}`)) {
      await removeTree(this.root, pending.path); await this.options.versions.setPending();
    }
  }
  private async reserve() {
    const tags = (await git(this.root, "tag", "--list", "v*")).split("\n").filter(tag => /^v[1-9][0-9]*$/.test(tag)).map(tag => Number(tag.slice(1)));
    return this.options.versions.reserve(Math.max(0, ...tags) + 1);
  }
  private async log(result: RunResult, mode: string) {
    await mkdir(join(this.root, "state"), { recursive: true });
    await appendFile(join(this.root, "state/runner-metrics.jsonl"), JSON.stringify({ at: Date.now(), mode, ...result }) + "\n", { mode: 0o600 });
  }
  async build(request: BuildRequest): Promise<RunResult> {
    if (this.busy) return { ok: false, outcome: "REVERTED", reason: "Runner is busy.", durationMs: 0, tokens: { input: null, output: null, total: null } };
    this.busy = true; const start = performance.now(), controller = new AbortController();
    const cancel = () => controller.abort(); request.signal.addEventListener("abort", cancel, { once: true });
    if (request.signal.aborted) controller.abort(); const signal = controller.signal;
    const timer = setTimeout(() => controller.abort(), Math.min(this.options.timeoutMs ?? BUILD_TIMEOUT_MS, BUILD_TIMEOUT_MS));
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
      const fixture = request.decision.mode === "fixture";
      const sourceEnv = this.options.env ?? process.env;
      tokens = await runCodex({ root: this.root, tree, bin: fixture ? fileURLToPath(new URL("../../checks/fixtures/fake-builder.cjs", import.meta.url)) : this.options.bin ?? sourceEnv.CODEX_BIN ?? "codex",
        env: fixture ? { ...sourceEnv, AWS_BEARER_TOKEN_BEDROCK: "offline-fixture-not-a-key" } : sourceEnv,
        decision: approved, signal, feed, ...(this.options.timeoutMs ? { timeoutMs: this.options.timeoutMs } : {}) });
      await auditDiff(tree, base, before, approved.files); feed("check", "Approved paths verified; compiling the candidate.");
      const protectedValues = Object.entries(sourceEnv).filter(([name, value]) => /TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY/i.test(name) && value && value.length >= 8).map(([, value]) => value!);
      for (const file of approved.files) {
        const source = await readFile(join(tree, file), "utf8");
        if (protectedValues.some(value => source.includes(value))) throw new Error("Candidate contained protected data.");
      }
      const nodeModules = fileURLToPath(new URL("../../node_modules", import.meta.url));
      const compiled = await compileModule(tree, approved.files[0]!, approved.spec.moduleId, nodeModules, approved.files);
      const retained = (previous?.modules ?? []).filter(m => m.id !== compiled.id);
      const modules = [...retained.map(m => ({ ...m, code: this.options.versions.bundle(m.hash)! })), { ...compiled, file: approved.files[0]! }];
      if (modules.length > 8) throw new Error("Eight active modules maximum.");
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
      const result: RunResult = { ok: true, outcome: "SHIPPED", reason: "Checks passed and live module swap acknowledged.", durationMs: Math.round(performance.now() - start), tokens, version, tag: `v${version}`, check };
      await this.log(result, fixture ? "fixture" : "live");
      try { await this.options.announce(`Shipped v${version}: ${approved.title} — requested by @${requester}`); } catch { feed("check", "Shipped; Twitch announcement unavailable."); } return result;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Build failed.";
      const key = (this.options.env ?? process.env).AWS_BEARER_TOKEN_BEDROCK;
      const reason = signal.aborted ? "Build timed out or was cancelled." : key && detail.includes(key) ? "Build failed; protected detail suppressed." : detail.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 180);
      if (merged && tree) {
        // Recovery is another forward commit, never a reset of the session checkout.
        await git(tree, "restore", "--source", base, "--staged", "--worktree", "--", "world/modules");
        const restored = await commitTree(tree, `Revert v${version}: activation failed`), next = version + 1;
        await promote(this.root, await git(this.root, "rev-parse", "master"), restored, `v${next}`);
        await this.options.versions.activate({ version: next, tag: `v${next}`, commit: restored, title: "Automatic revert", requester, modules: previous?.modules ?? [], restoredFrom: previous?.tag ?? "v0" }, false);
      }
      feed("error", `REVERTED · ${reason}`);
      const result: RunResult = { ok: false, outcome: "REVERTED", reason, durationMs: Math.round(performance.now() - start), tokens, ...(check ? { check } : {}) };
      await this.log(result, request.decision.mode); return result;
    } finally {
      clearTimeout(timer); request.signal.removeEventListener("abort", cancel); controller.abort();
      try { if (tree) await removeTree(this.root, tree); } finally { await this.options.versions.setPending(); this.busy = false; }
    }
  }
  async rollback(requester: string, automatic = false): Promise<RunResult> {
    const baseline = this.options.versions.baseline;
    const start = performance.now(), target = this.options.versions.previous() ?? (automatic && baseline ? { version: 0, tag: "v0", commit: baseline, title: "Original world", requester: "system", modules: [], receipt: "" } : null), tokens = { input: 0, output: 0, total: 0 };
    if (this.busy || !target) return { ok: false, outcome: "REVERTED", reason: this.busy ? "Runner is busy." : "No previous tag to restore.", durationMs: 0, tokens };
    this.busy = true; let tree = "";
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
    } catch (error) { const result: RunResult = { ok: false, outcome: "REVERTED", reason: error instanceof Error ? error.message : "Rollback failed.", durationMs: Math.round(performance.now() - start), tokens }; await this.log(result, "rollback"); return result; }
    finally { if (tree) await removeTree(this.root, tree); await this.options.versions.setPending(); this.busy = false; }
  }
}

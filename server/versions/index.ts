import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
export interface ModuleArtifact { id: string; url: string; hash: string; file: string }
export interface WorldVersion { version: number; tag: string; commit: string; title: string; requester: string; modules: ModuleArtifact[]; receipt: string; restoredFrom?: string }
interface Stored { baseline?: string; counter: number; current: WorldVersion | null; history: WorldVersion[]; pending?: { path: string; base: string; version: number } }
export class Versions {
  private data: Stored = { counter: 0, current: null, history: [] };
  private readonly bundles = new Map<string, string>();
  private waiters = new Map<string, { resolve(ok: boolean): void; timer: ReturnType<typeof setTimeout> }>();
  constructor(readonly root: string, private publish: (version: WorldVersion | null) => void) {}
  async init() {
    try { this.data = JSON.parse(await readFile(join(this.root, "state/versions.json"), "utf8")) as Stored; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Version recovery state is invalid."); }
    for (const version of this.data.history) for (const module of version.modules) {
      if (!/^[a-f0-9]{64}$/.test(module.hash) || module.url !== `/modules/${module.hash}.js`) throw new Error("Invalid persisted module artifact.");
      const code = await readFile(join(this.root, "state/modules", `${module.hash}.js`), "utf8");
      if (createHash("sha256").update(code).digest("hex") !== module.hash) throw new Error("Persisted module hash mismatch.");
      this.bundles.set(module.hash, code);
    }
  }
  get baseline() { return this.data.baseline; }
  async baselineAt(commit: string) { if (!this.data.baseline) { this.data.baseline = commit; await this.save(); } }
  get current() { return this.data.current ? structuredClone(this.data.current) : null; }
  get history() { return structuredClone(this.data.history); }
  get pending() { return this.data.pending; }
  async save() {
    await mkdir(join(this.root, "state"), { recursive: true });
    const file = join(this.root, "state/versions.json"), temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(this.data), { mode: 0o600 }); await rename(temporary, file);
  }
  async reserve(minimum = 1) { return Math.max(this.data.counter + 1, minimum); }
  async setPending(value?: Stored["pending"]) { if (value) this.data.pending = value; else delete this.data.pending; await this.save(); }
  async artifact(id: string, file: string, code: string): Promise<ModuleArtifact> {
    const hash = createHash("sha256").update(code).digest("hex"); this.bundles.set(hash, code);
    await mkdir(join(this.root, "state/modules"), { recursive: true });
    await writeFile(join(this.root, "state/modules", `${hash}.js`), code, { mode: 0o600 });
    return { id, file, hash, url: `/modules/${hash}.js` };
  }
  bundle(hash: string) { return /^[a-f0-9]{64}$/.test(hash) ? this.bundles.get(hash) : undefined; }
  async activate(version: Omit<WorldVersion, "receipt">, wait = true) {
    this.data.counter = Math.max(this.data.counter, version.version);
    const next = { ...version, receipt: randomUUID() }; this.data.current = next; this.data.history.push(next); await this.save();
    let receipt: Promise<boolean> = Promise.resolve(true);
    if (wait) receipt = new Promise(resolve => {
      const timer = setTimeout(() => { this.waiters.delete(next.receipt); resolve(false); }, 8000);
      this.waiters.set(next.receipt, { resolve, timer });
    });
    this.publish(next); return receipt;
  }
  acknowledge(version: number, receipt: string, ok: boolean) {
    if (this.data.current?.version !== version || this.data.current.receipt !== receipt) return false;
    const pending = this.waiters.get(receipt); if (pending) { clearTimeout(pending.timer); this.waiters.delete(receipt); pending.resolve(ok); }
    return true;
  }
  /** Rollback is to the prior successful activation, with source content retained by its tag. */
  previous() { return this.data.history.length > 1 ? structuredClone(this.data.history[this.data.history.length - 2]!) : null; }
  close() { for (const w of this.waiters.values()) { clearTimeout(w.timer); w.resolve(false); } this.waiters.clear(); }
}

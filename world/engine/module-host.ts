import { Group, Vector3 } from "three";
import type { ChatEvent, RaidEvent } from "../../server/contracts.js";
import type { Citizen, SpawnHandle, WorldModule, WorldModuleFactory, WorldServices } from "./api.js";
import { emptyUsage, MODULE_CAP, ResourceLedger, ResourceOwner, type Usage } from "./resources.js";

export const MODULE_BUDGET = Object.freeze({
  maxActive: 8, perModuleMs: 2, totalMs: 4, maxDtSeconds: 0.05,
  overrunWindow: 60, disableAfterOverruns: 3, lifecycleMs: 8,
  maxEvents: 128, eventsPerFrame: 16,
});

type Event = { kind: "onChat"; value: Readonly<ChatEvent> } |
  { kind: "onCitizenSpawn"; value: Citizen } | { kind: "onRaid"; value: Readonly<RaidEvent> };
export interface ModuleStatus { id: string; state: "active" | "disabled" | "rejected" | "disposed"; reason: string }
interface RecordState {
  module: WorldModule; id: string; key: string; root: Group; owner: ResourceOwner;
  queue: Event[]; overruns: number[]; handles: Set<SpawnHandle>; spawnUsage: Map<SpawnHandle, Usage>; active: boolean; cleaned: boolean;
  window: number; effects: number; logs: number; lastFocus: number; lastQueueWarning: number;
}
interface HostOptions {
  root: Group;
  services: Omit<WorldServices, "scene">;
  ledger?: ResourceLedger;
  protectedResources?: ResourceOwner;
  now?: () => number;
  onStatus?: (status: ModuleStatus) => void;
}
const snapshot = (citizen: Citizen): Citizen => Object.freeze({
  id: citizen.id, displayName: citizen.displayName, color: citizen.color,
  position: Object.freeze(new Vector3(citizen.position.x, citizen.position.y, citizen.position.z)),
});
const position = (p: Readonly<Vector3>) => {
  if (![p.x, p.y, p.z].every(Number.isFinite)) throw new Error("invalid position");
  return new Vector3(Math.max(-64, Math.min(64, p.x)), Math.max(-8, Math.min(48, p.y)), Math.max(-64, Math.min(64, p.z)));
};

/** Cooperative hook isolation; candidate code still requires the external guard/check gate. */
export class ModuleHost {
  private readonly records = new Map<string, RecordState>();
  private readonly now: () => number;
  private readonly ledger: ResourceLedger;
  private frame = 0;
  private serial = 0;
  private cursor = 0;
  private paused = false;

  constructor(private readonly options: HostOptions) {
    this.now = options.now ?? (() => performance.now());
    this.ledger = options.ledger ?? new ResourceLedger(emptyUsage());
  }

  private status(id: string, state: ModuleStatus["state"], reason: string) {
    this.options.onStatus?.({ id, state, reason });
  }

  private invoke(record: RecordState, hook: keyof Omit<WorldModule, "id">, callback: () => unknown): number {
    const start = this.now();
    let result: unknown;
    try { result = callback(); } catch { throw new Error(`${hook} threw`); }
    if (result && typeof (result as { then?: unknown }).then === "function") {
      // Consume a rejected async hook so it cannot create an unhandled rejection.
      void Promise.resolve(result).catch(() => {});
      throw new Error(`${hook} must be synchronous`);
    }
    return Math.max(0, this.now() - start);
  }

  private services(record: RecordState): WorldServices {
    const allow = () => { if (record.cleaned) throw new Error("module has been disposed"); };
    const limits = () => {
      allow();
      const second = Math.floor(this.now() / 1000);
      if (record.window !== second) { record.window = second; record.effects = 0; record.logs = 0; }
    };
    return Object.freeze({
      scene: record.root,
      citizens: Object.freeze({
        get: (id: string) => { allow(); const citizen = this.options.services.citizens.get(id); return citizen ? snapshot(citizen) : undefined; },
        list: () => { allow(); return Object.freeze(this.options.services.citizens.list().map(snapshot)); },
      }),
      spawnSpec: (spec: Parameters<WorldServices["spawnSpec"]>[0]) => {
        allow();
        // The engine materializer validates and reserves globally; this host also caps aggregate module ownership.
        const handle = this.options.services.spawnSpec(spec);
        const usage = (handle as SpawnHandle & { usage?: Usage }).usage ?? emptyUsage();
        const owned: SpawnHandle = { id: handle.id, dispose: () => {
          if (!record.handles.delete(owned)) return;
          record.spawnUsage.delete(owned); handle.dispose();
        } };
        record.handles.add(owned); record.spawnUsage.set(owned, usage);
        try { this.audit(record); } catch { owned.dispose(); throw new Error("module spawn allocation limit exceeded"); }
        return Object.freeze(owned);
      },
      camera: Object.freeze({ focus: (target: Readonly<Vector3>, opts: { duration?: number; priority?: number } = {}) => {
        allow();
        if (this.now() - record.lastFocus < 1000) return;
        record.lastFocus = this.now();
        this.options.services.camera.focus(position(target), {
          duration: Number.isFinite(opts.duration) ? Math.max(0.25, Math.min(5, opts.duration!)) : 2.5,
          priority: Number.isFinite(opts.priority) ? Math.max(0, Math.min(3, Math.round(opts.priority!))) : 1,
        });
      } }),
      effects: Object.freeze({ play: (name: "spawn" | "portal" | "sparkle", target: Readonly<Vector3>) => {
        limits();
        if (!["spawn", "portal", "sparkle"].includes(name)) throw new Error("unsupported effect");
        if (record.effects++ < 4) this.options.services.effects.play(name, position(target));
      } }),
      log: (level: "info" | "warn" | "error", message: string) => {
        limits();
        if (!["info", "warn", "error"].includes(level)) return;
        if (record.logs++ < 10) this.options.services.log(level, `[${record.id}] ${String(message)}`.slice(0, 512));
      },
    });
  }

  private audit(record: RecordState) {
    const raw = record.owner.audit(record.root, 256);
    for (const key of Object.keys(MODULE_CAP) as (keyof Usage)[]) {
      let total = raw[key]; for (const usage of record.spawnUsage.values()) total += usage[key];
      if (total > MODULE_CAP[key]) throw new Error(`${key} module limit exceeded`);
    }
    // Materializer reservations already charge global usage; only raw scene resources go here.
    this.ledger.reserve(record.key, raw);
  }

  /** Init and audit candidate before retiring a previous instance with the same ID. */
  load(factory: WorldModuleFactory): boolean {
    let module: WorldModule;
    const start = this.now();
    try { module = factory(); } catch { this.status("candidate", "rejected", "factory threw"); return false; }
    const hooks = ["init", "update", "onChat", "onCitizenSpawn", "onRaid", "dispose"] as const;
    if (!module || typeof module.id !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]{0,47}$/.test(module.id) || hooks.some(hook => typeof module[hook] !== "function")) {
      this.status("candidate", "rejected", "invalid World Module API"); return false;
    }
    if (!this.records.has(module.id) && this.records.size >= MODULE_BUDGET.maxActive) {
      this.status(module.id, "rejected", "eight active modules maximum"); return false;
    }
    const root = new Group();
    root.name = `module:${module.id}`;
    const record: RecordState = {
      module, id: module.id, root, key: `${module.id}:${++this.serial}`, owner: new ResourceOwner(this.options.protectedResources),
      queue: [], overruns: [], handles: new Set<SpawnHandle>(), active: false, cleaned: false,
      spawnUsage: new Map(), window: -1, effects: 0, logs: 0, lastFocus: -Infinity, lastQueueWarning: -Infinity,
    };
    const services = this.services(record);
    try {
      if (this.now() - start > MODULE_BUDGET.lifecycleMs) throw new Error("factory exceeded 8 ms");
      const elapsed = this.invoke(record, "init", () => module.init(services));
      if (elapsed > MODULE_BUDGET.lifecycleMs) throw new Error("init exceeded 8 ms");
      if (root.parent) throw new Error("module group escaped ownership");
      this.audit(record);
    } catch (error) {
      this.status(module.id, "rejected", error instanceof Error ? error.message : "init failed");
      this.cleanup(record);
      return false;
    }
    const previous = this.records.get(module.id);
    if (previous) this.cleanup(previous);
    this.options.root.add(root);
    record.active = true;
    this.records.set(module.id, record);
    this.status(module.id, "active", "module activated");
    return true;
  }

  private cleanup(record: RecordState) {
    if (record.cleaned) return;
    record.active = false;
    record.cleaned = true;
    try {
      if (this.invoke(record, "dispose", () => record.module.dispose()) > MODULE_BUDGET.lifecycleMs) {
        this.status(record.id, "disabled", "dispose exceeded 8 ms; host cleanup applied");
      }
    } catch { this.status(record.id, "disabled", "dispose threw; host cleanup applied"); }
    for (const handle of record.handles) { try { handle.dispose(); } catch { /* Continue releasing all allocations. */ } }
    // Also collect resources added by a hook that threw before its regular audit.
    try { record.owner.audit(record.root, 2048); } catch { /* Audit has captured the bounded prefix. */ }
    record.owner.dispose(record.root);
    this.ledger.release(record.key);
    record.queue.length = 0;
  }

  unload(id: string) {
    const record = this.records.get(id);
    if (!record) return;
    this.cleanup(record);
    this.records.delete(id);
    this.status(id, "disposed", "module removed");
  }

  onChat(event: Readonly<ChatEvent>) { this.enqueue({ kind: "onChat", value: Object.freeze({ ...event }) }); }
  onCitizenSpawn(citizen: Citizen) { this.enqueue({ kind: "onCitizenSpawn", value: snapshot(citizen) }); }
  onRaid(event: Readonly<RaidEvent>) { this.enqueue({ kind: "onRaid", value: Object.freeze({ ...event }) }); }
  private enqueue(event: Event) {
    for (const record of this.records.values()) {
      if (record.queue.length >= MODULE_BUDGET.maxEvents) {
        record.queue.shift();
        if (this.now() - record.lastQueueWarning >= 1000) {
          record.lastQueueWarning = this.now();
          this.options.services.log("warn", `[${record.id}] event queue full; oldest dropped`);
        }
      }
      record.queue.push(event);
    }
  }

  setPaused(paused: boolean) { this.paused = paused; }

  update(dt: number) {
    if (this.paused || this.records.size === 0) return;
    this.frame++;
    const start = this.now();
    const records = [...this.records.values()];
    const disabled: RecordState[] = [];
    const seconds = Number.isFinite(dt) ? Math.max(0, Math.min(MODULE_BUDGET.maxDtSeconds, dt)) : 0;
    for (let index = 0; index < records.length; index++) {
      if (this.now() - start >= MODULE_BUDGET.totalMs) break;
      const record = records[(index + this.cursor) % records.length]!;
      let elapsed = 0;
      try {
        if (record.root.parent !== this.options.root) throw new Error("module group escaped ownership");
        let dispatched = 0;
        while (record.queue.length && dispatched++ < MODULE_BUDGET.eventsPerFrame && elapsed < MODULE_BUDGET.perModuleMs && this.now() - start < MODULE_BUDGET.totalMs) {
          const event = record.queue.shift()!;
          elapsed += this.invoke(record, event.kind, () => {
            if (event.kind === "onChat") record.module.onChat(event.value);
            else if (event.kind === "onRaid") record.module.onRaid(event.value);
            else record.module.onCitizenSpawn(event.value);
          });
        }
        if (elapsed < MODULE_BUDGET.perModuleMs && this.now() - start < MODULE_BUDGET.totalMs) {
          elapsed += this.invoke(record, "update", () => record.module.update(seconds));
        }
        if (record.root.parent !== this.options.root) throw new Error("module group escaped ownership");
        this.audit(record);
        record.overruns = record.overruns.filter(frame => frame > this.frame - MODULE_BUDGET.overrunWindow);
        if (elapsed > MODULE_BUDGET.perModuleMs) record.overruns.push(this.frame);
        if (record.overruns.length >= MODULE_BUDGET.disableAfterOverruns) throw new Error("three 2 ms overruns in 60 frames");
      } catch (error) {
        record.active = false;
        record.root.visible = false;
        this.status(record.id, "disabled", error instanceof Error ? error.message : "hook failed");
        disabled.push(record);
      }
    }
    this.cursor = records.length ? (this.cursor + 1) % records.length : 0;
    for (const record of disabled) { this.cleanup(record); this.records.delete(record.id); }
  }

  get activeCount() { return this.records.size; }
  dispose() { for (const id of this.records.keys()) this.unload(id); }
}

/** Single admission contract for server, materializer and module host. No runtime state or Node imports. */
export interface Usage { nodes: number; triangles: number; draws: number; lights: number; particles: number }
export const GLOBAL_CAP: Readonly<Usage> = Object.freeze({ nodes: 1024, triangles: 200_000, draws: 256, lights: 8, particles: 2048 });
export const MODULE_CAP: Readonly<Usage> = Object.freeze({ nodes: 64, triangles: 50_000, draws: 64, lights: 4, particles: 512 });
export const SUMMON_COUNT = 24;
export const CITIZEN_CAP = 300;
export const ACTIVE_MODULE_CAP = 8;
export const WORLD_BOUNDS = Object.freeze({ minX: -64, maxX: 64, minY: -8, maxY: 48, minZ: -64, maxZ: 64 });
export const SPEC_LIMITS = Object.freeze({ maxBytes: 32_768, maxScaledAxis: 24, minY: WORLD_BOUNDS.minY, maxY: WORLD_BOUNDS.maxY });
export const SUMMON_POOL: Readonly<Usage> = Object.freeze({ nodes: 512, triangles: 70_000, draws: 128, lights: 6, particles: 1024 });
export const WORST_SPEC: Readonly<Usage> = MODULE_CAP;
export const usageKeys = Object.keys(GLOBAL_CAP) as (keyof Usage)[];
export const emptyUsage = (): Usage => ({ nodes: 0, triangles: 0, draws: 0, lights: 0, particles: 0 });
export function modulePool(base: Usage): Usage { return Object.fromEntries(usageKeys.map(k => [k, Math.max(0, GLOBAL_CAP[k] - base[k] - SUMMON_POOL[k])])) as unknown as Usage; }
export class RenderFailure extends Error {
  constructor(readonly code: "capacity" | "invalid-spec" | "allocation" | "render-error", detail: string = code) { super(detail); }
}
/** Pending reservations charge the full schema envelope. Only committed scenes may be evicted. */
export class SummonReservations {
  private readonly entries = new Map<string, { usage: Usage; pending: boolean }>();
  constructor(private readonly evict: (id: string) => void) {}
  get size() { return this.entries.size; }
  usage() { const total = emptyUsage(); for (const entry of this.entries.values()) for (const k of usageKeys) total[k] += entry.usage[k]; return total; }
  reserve(id: string): boolean {
    if (this.entries.has(id)) return false;
    const fits = () => { const used = this.usage(); return this.entries.size < SUMMON_COUNT && usageKeys.every(k => used[k] + WORST_SPEC[k] <= SUMMON_POOL[k]); };
    while (!fits()) {
      const oldest = [...this.entries].find(([,e]) => !e.pending)?.[0];
      if (!oldest) return false;
      this.entries.delete(oldest); this.evict(oldest);
    }
    this.entries.set(id, { usage: { ...WORST_SPEC }, pending: true }); return true;
  }
  commit(id: string, usage: Usage) {
    const entry = this.entries.get(id);
    if (!entry?.pending || usageKeys.some(k => !Number.isFinite(usage[k]) || usage[k] < 0 || usage[k] > WORST_SPEC[k])) throw new RenderFailure("invalid-spec", "Scene exceeds its reserved envelope");
    this.entries.set(id, { usage: { ...usage }, pending: false });
  }
  release(id: string) { this.entries.delete(id); }
}

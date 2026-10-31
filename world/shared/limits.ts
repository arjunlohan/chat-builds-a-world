/** Single admission contract for server, materializer and module host. No runtime state or Node imports. */
export interface Usage { nodes: number; triangles: number; draws: number; lights: number; particles: number }
export const GLOBAL_CAP: Readonly<Usage> = Object.freeze({ nodes: 1024, triangles: 200_000, draws: 256, lights: 8, particles: 2048 });
export const MODULE_CAP: Readonly<Usage> = Object.freeze({ nodes: 64, triangles: 50_000, draws: 64, lights: 4, particles: 512 });
export const SUMMON_COUNT = 24;
export const CITIZEN_CAP = 300;
export const IDLE_MS = 20 * 60_000, FADE_MS = 5000;
export const ACTIVE_MODULE_CAP = 8;
export const WORLD_BOUNDS = Object.freeze({ minX: -64, maxX: 64, minY: -8, maxY: 48, minZ: -64, maxZ: 64 });
export interface WorldPoint { x: number; y: number; z: number }
const halfExtent = (extent: Readonly<WorldPoint> | number, axis: keyof WorldPoint) => typeof extent==="number"?extent:extent[axis];
/** Mutates the caller-owned point; accepts box half-extents or a spherical radius. */
export function clampToWorld<T extends WorldPoint>(p: T, extent: Readonly<WorldPoint> | number = 0): T {
  const x=halfExtent(extent,"x"),y=halfExtent(extent,"y"),z=halfExtent(extent,"z");
  if(x<0||y<0||z<0||x*2>WORLD_BOUNDS.maxX-WORLD_BOUNDS.minX||y*2>WORLD_BOUNDS.maxY-WORLD_BOUNDS.minY||z*2>WORLD_BOUNDS.maxZ-WORLD_BOUNDS.minZ)throw new Error("Envelope cannot fit world bounds");
  p.x=Math.max(WORLD_BOUNDS.minX+x,Math.min(WORLD_BOUNDS.maxX-x,p.x));p.y=Math.max(WORLD_BOUNDS.minY+y,Math.min(WORLD_BOUNDS.maxY-y,p.y));p.z=Math.max(WORLD_BOUNDS.minZ+z,Math.min(WORLD_BOUNDS.maxZ-z,p.z));return p;
}
export function fitsBounds(p: Readonly<WorldPoint>, extent: Readonly<WorldPoint> | number = 0): boolean {
  const x=halfExtent(extent,"x"),y=halfExtent(extent,"y"),z=halfExtent(extent,"z");
  return x>=0&&y>=0&&z>=0&&p.x-x>=WORLD_BOUNDS.minX&&p.x+x<=WORLD_BOUNDS.maxX&&p.y-y>=WORLD_BOUNDS.minY&&p.y+y<=WORLD_BOUNDS.maxY&&p.z-z>=WORLD_BOUNDS.minZ&&p.z+z<=WORLD_BOUNDS.maxZ;
}
export const SPEC_LIMITS = Object.freeze({ maxBytes: 32_768, maxScaledAxis: 24, minY: WORLD_BOUNDS.minY, maxY: WORLD_BOUNDS.maxY });
export const SUMMON_POOL: Readonly<Usage> = Object.freeze({ nodes: 512, triangles: 70_000, draws: 128, lights: 6, particles: 1024 });
export const usageKeys = Object.keys(GLOBAL_CAP) as (keyof Usage)[];
export const emptyUsage = (): Usage => ({ nodes: 0, triangles: 0, draws: 0, lights: 0, particles: 0 });
export function modulePool(base: Usage): Usage { return Object.fromEntries(usageKeys.map(k => [k, Math.max(0, GLOBAL_CAP[k] - base[k] - SUMMON_POOL[k])])) as unknown as Usage; }
export class RenderFailure extends Error {
  constructor(readonly code: "capacity" | "invalid-spec" | "allocation" | "render-error", detail: string = code) { super(detail); }
}
export class ItemLimitError extends RenderFailure {
  constructor(key: keyof Usage) { super("invalid-spec",`${key} module limit exceeded`); }
}
/** Non-mutating admission queries share the same arithmetic as atomic reservation. */
export class ResourceLedger {
  private readonly reservations = new Map<string, Usage>();
  constructor(readonly base: Usage = emptyUsage(), private readonly cap: Readonly<Usage> = GLOBAL_CAP) {}
  usage() { const used={...this.base};for(const entry of this.reservations.values())for(const key of usageKeys)used[key]+=entry[key];return used; }
  itemError(usage: Usage) {const key=usageKeys.find(k=>!Number.isFinite(usage[k])||usage[k]<0||usage[k]>MODULE_CAP[k]);return key?new ItemLimitError(key):undefined;}
  shortfall(id: string, usage: Usage, excluding?: ReadonlySet<string>) {
    const needed={...this.base};for(const key of usageKeys)needed[key]+=usage[key];
    for(const [owner,used] of this.reservations)if(owner!==id&&!excluding?.has(owner))for(const key of usageKeys)needed[key]+=used[key];
    for(const key of usageKeys)needed[key]=Math.max(0,needed[key]-this.cap[key]);return needed;
  }
  fits(id: string, usage: Usage, excluding?: ReadonlySet<string>) {const needed=this.shortfall(id,usage,excluding);return !this.itemError(usage)&&usageKeys.every(key=>needed[key]===0);}
  reserve(id: string, usage: Usage) {
    const invalid=this.itemError(usage);if(invalid)throw invalid;
    const shortfall=this.shortfall(id,usage),key=usageKeys.find(k=>shortfall[k]>0);if(key)throw new RenderFailure("capacity",`${key} world limit exceeded`);
    this.reservations.set(id,{...usage});
  }
  release(id: string) { this.reservations.delete(id); }
}
/** Pending jobs reserve count slots; synchronous commit admits their actual validated usage. */
export class SummonReservations {
  private readonly entries = new Map<string, { pending: boolean }>();
  private readonly ledger = new ResourceLedger(emptyUsage(), SUMMON_POOL);
  constructor(private readonly evict: (id: string) => void) {}
  get size() { return this.entries.size; }
  usage() { return this.ledger.usage(); }
  private evictOldest() {
    for(const [id,entry] of this.entries)if(!entry.pending){this.release(id);this.evict(id);return true;}
    return false;
  }
  reserve(id: string): boolean {
    if(this.entries.has(id))return false;
    if(this.entries.size>=SUMMON_COUNT&&!this.evictOldest())return false;
    this.entries.set(id,{pending:true});return true;
  }
  commit(id: string, usage: Usage) {
    const entry=this.entries.get(id);
    if(!entry?.pending)throw new RenderFailure("invalid-spec","No pending summon slot");
    const invalid=this.ledger.itemError(usage);if(invalid)throw invalid;
    const victims=new Set<string>();
    for(const [owner,record] of this.entries){
      if(this.ledger.fits(id,usage,victims))break;
      if(!record.pending)victims.add(owner);
    }
    if(!this.ledger.fits(id,usage,victims))throw new RenderFailure("capacity");
    for(const owner of victims){this.release(owner);this.evict(owner);}
    this.ledger.reserve(id,usage);
    entry.pending=false;
  }
  release(id: string) { this.entries.delete(id);this.ledger.release(id); }
}

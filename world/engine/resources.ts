import { BufferGeometry, Group, Light, Material, Mesh, Points, Texture, type Object3D } from "three";

export interface Usage { nodes: number; triangles: number; draws: number; lights: number; particles: number }
export const GLOBAL_CAP: Usage = { nodes: 1024, triangles: 200_000, draws: 256, lights: 8, particles: 2048 };
export const MODULE_CAP: Usage = { nodes: 64, triangles: 50_000, draws: 64, lights: 4, particles: 512 };
export const emptyUsage = (): Usage => ({ nodes: 0, triangles: 0, draws: 0, lights: 0, particles: 0 });
const keys = Object.keys(GLOBAL_CAP) as (keyof Usage)[];

export class ResourceOwner {
  readonly geometries = new Set<BufferGeometry>();
  readonly materials = new Set<Material>();
  readonly textures = new Set<Texture>();
  private readonly objects = new Set<Object3D>();

  constructor(private readonly protectedResources?: ResourceOwner) {}

  /** Audit a bounded tree. Assets removed later still belong to this owner. */
  audit(root: Object3D, limit = 2048): Usage {
    const usage = emptyUsage(), stack = [root];
    let visited = 0;
    while (stack.length) {
      if (++visited > limit) throw new Error("scene graph limit exceeded");
      const object = stack.pop()!;
      this.objects.add(object);
      for (const child of object.children) stack.push(child);
      if (object instanceof Mesh || object instanceof Points) {
        if (this.protectedResources?.geometries.has(object.geometry)) throw new Error("engine geometry is not module-owned");
        this.geometries.add(object.geometry);
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (this.protectedResources?.materials.has(material)) throw new Error("engine material is not module-owned");
          this.materials.add(material);
          for (const value of Object.values(material)) {
            if (value instanceof Texture) {
              if (this.protectedResources?.textures.has(value)) throw new Error("engine texture is not module-owned");
              this.textures.add(value);
            }
          }
        }
        const count = "isInstancedMesh" in object ? (object as Mesh & { count: number }).count : 1;
        const vertices = object.geometry.index?.count ?? object.geometry.getAttribute("position")?.count ?? 0;
        usage.draws += Math.max(1, object.geometry.groups.length);
        if (object instanceof Points) usage.particles += vertices;
        else { usage.nodes++; usage.triangles += vertices / 3 * count; }
      }
      if (object instanceof Light && object.type !== "HemisphereLight" && object.type !== "AmbientLight") usage.lights++;
    }
    return usage;
  }

  dispose(root: Group) {
    root.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    for (const object of this.objects) {
      const disposable = object as Object3D & { dispose?: () => void; shadow?: { dispose(): void } };
      if (object instanceof Mesh && "isInstancedMesh" in object) disposable.dispose?.();
      if (object instanceof Light) disposable.shadow?.dispose();
    }
    root.clear();
    this.geometries.clear(); this.materials.clear(); this.textures.clear(); this.objects.clear();
  }
}

export class ResourceLedger {
  private readonly reservations = new Map<string, Usage>();
  constructor(readonly base: Usage = emptyUsage()) {}

  reserve(id: string, usage: Usage) {
    for (const key of keys) {
      if (!Number.isFinite(usage[key]) || usage[key] < 0 || usage[key] > MODULE_CAP[key]) throw new Error(`${key} module limit exceeded`);
      let total = this.base[key] + usage[key];
      for (const [owner, used] of this.reservations) if (owner !== id) total += used[key];
      if (total > GLOBAL_CAP[key]) throw new Error(`${key} world limit exceeded`);
    }
    this.reservations.set(id, usage);
  }

  release(id: string) { this.reservations.delete(id); }
}

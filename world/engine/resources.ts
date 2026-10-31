import { BufferGeometry, Group, Light, Material, Mesh, Points, Texture, type Object3D } from "three";

import { emptyUsage, type Usage } from "../shared/limits.js";
export { GLOBAL_CAP, MODULE_CAP, emptyUsage, ResourceLedger, type Usage } from "../shared/limits.js";

export class ResourceOwner {
  readonly geometries = new Set<BufferGeometry>();
  readonly materials = new Set<Material>();
  readonly textures = new Set<Texture>();
  private readonly objects = new Set<Object3D>();

  private readonly scannedMaterials = new WeakSet<Material>();
  constructor(private readonly protectedResources?: ResourceOwner, private readonly changed?: () => void) {}

  /** Audit a bounded tree. Assets removed later still belong to this owner. */
  audit(root: Object3D, limit = 2048): Usage {
    const usage = emptyUsage(), stack = [root];
    let visited = 0;
    while (stack.length) {
      if (++visited > limit) throw new Error("scene graph limit exceeded");
      const object = stack.pop()!;
      if (!this.objects.has(object) && this.changed) { object.addEventListener("childadded", this.changed); object.addEventListener("childremoved", this.changed); }
      this.objects.add(object);
      for (const child of object.children) stack.push(child);
      if (object instanceof Mesh || object instanceof Points) {
        if (this.protectedResources?.geometries.has(object.geometry)) throw new Error("engine geometry is not module-owned");
        this.geometries.add(object.geometry);
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (this.protectedResources?.materials.has(material)) throw new Error("engine material is not module-owned");
          this.materials.add(material);
          if (!this.scannedMaterials.has(material)) for (const value of Object.values(material)) {
            if (value instanceof Texture) {
              if (this.protectedResources?.textures.has(value)) throw new Error("engine texture is not module-owned");
              this.textures.add(value);
            }
          }
          this.scannedMaterials.add(material);
        }
        const count = "isInstancedMesh" in object ? (object as Mesh & { count: number }).count : 1;
        const vertices = object.geometry.index?.count ?? object.geometry.getAttribute("position")?.count ?? 0;
        const drawMaterials = Array.isArray(object.material) ? object.material : undefined;
        usage.draws += drawMaterials ? object.geometry.groups.reduce((count: number, group: {materialIndex?:number}) => count + Number(!!drawMaterials[group.materialIndex ?? 0]), 0) : 1;
        if (object instanceof Points) usage.particles += vertices;
        else { usage.nodes++; usage.triangles += vertices / 3 * count; }
      }
      if (object instanceof Light && object.type !== "HemisphereLight" && object.type !== "AmbientLight" && object.type !== "DirectionalLight") usage.lights++;
    }
    return usage;
  }

  dispose(root: Group) {
    root.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    for (const object of this.objects) {
      if (this.changed) { object.removeEventListener("childadded",this.changed); object.removeEventListener("childremoved",this.changed); }
      const disposable = object as Object3D & { dispose?: () => void; shadow?: { dispose(): void } };
      if (object instanceof Mesh && "isInstancedMesh" in object) disposable.dispose?.();
      if (object instanceof Light) disposable.shadow?.dispose();
    }
    root.clear();
    this.geometries.clear(); this.materials.clear(); this.textures.clear(); this.objects.clear();
  }
}

import {RoundedBoxGeometry} from "three/addons/geometries/RoundedBoxGeometry.js";
import {surfaceNormals} from "./materials.js";
import type {WorldLook} from "./render-profile.js";
import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, PlaneGeometry, SphereGeometry, TorusGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { SceneSpec } from "../../server/summon/scene-spec.js";

type GeometrySpec = SceneSpec["geometries"][number];
export function triangleCost(kind: GeometrySpec["kind"], detail: number,look:WorldLook="new") {
  const w = (look==="classic"?8:16) + detail * 4, h = (look==="classic"?4:8) + detail * 2;
  return { box: look==="classic"?12:300, sphere: 2 * w * (h - 1), cylinder: 4 * w, cone: 2 * w,
    torus: 2 * w * (look==="classic"?6:10), plane: 2, crystal: 20, mushroom: 2 * w * (h - 1) + 4 * w, tree: look==="classic"?424:448 }[kind];
}
function merge(parts: BufferGeometry[]) {
  const flat = parts.map(p => p.index ? p.toNonIndexed() : p.clone());
  const geometry = mergeGeometries(flat, false);
  for (const p of [...parts, ...flat]) p.dispose();
  if (!geometry) throw new Error("Procedural recipe failed");
  return geometry;
}
/** Vetted, finite recipes. Every result is fitted to its declared local bounding box. */
export function createSpecGeometry(spec: GeometrySpec,look:WorldLook="new") {
  const w = (look==="classic"?8:16) + spec.detail * 4, h = (look==="classic"?4:8) + spec.detail * 2;
  let geometry: BufferGeometry;
  switch (spec.kind) {
    case "box": geometry = look==="classic"?new BoxGeometry(1, 1, 1):new RoundedBoxGeometry(1,1,1,2,.06); break;
    case "sphere": geometry = new SphereGeometry(1, w, h); break;
    case "cylinder": geometry = new CylinderGeometry(1, 1, 1, w); break;
    case "cone": geometry = new ConeGeometry(1, 1, w); break;
    case "torus": geometry = new TorusGeometry(1, 0.22, look==="classic"?6:10, w); break;
    case "plane": geometry = new PlaneGeometry(1, 1); break;
    case "crystal": geometry = new IcosahedronGeometry(1, 0); break;
    case "mushroom": geometry = merge([
      new CylinderGeometry(0.16, 0.22, 1, w).translate(0, -0.25, 0),
      new SphereGeometry(1, w, h).scale(1, 0.4, 1).translate(0, 0.4, 0),
    ]); break;
    case "tree": {
      const parts: BufferGeometry[] = [new CylinderGeometry(0.12, 0.22, 1.6, look==="classic"?6:12).translate(0, -0.4, 0)];
      for (let i = 0; i < 5; i++) parts.push(new IcosahedronGeometry(1, 1).scale(0.8, 0.45, 0.8).translate(Math.cos(i * 2.4) * 0.5, 0.6 + i * 0.06, Math.sin(i * 2.4) * 0.5));
      geometry = merge(parts); break;
    }
  }
  if(look!=="classic")geometry=surfaceNormals(geometry,look,["cylinder","cone","crystal"].includes(spec.kind)?Math.PI/4:Math.PI);
  geometry.center(); geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const dimensions = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
  geometry.scale(...spec.size.map((size, axis) => dimensions[axis]! > 0 ? size / dimensions[axis]! : 1) as [number, number, number]);
  geometry.computeBoundingSphere();
  return geometry;
}

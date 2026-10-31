import { Ajv2020 } from "ajv/dist/2020.js";
import schema from "./scene-spec.schema.json";

export type Vec3 = [number, number, number];
export interface SceneSpec {
  version: 1;
  name: string;
  geometries: { id: string; kind: "box" | "sphere" | "cylinder" | "cone" | "torus" | "plane" | "crystal" | "mushroom" | "tree"; size: Vec3; detail: number }[];
  materials: { id: string; color: string; emissive: string; emissiveIntensity: number; roughness: number; metalness: number; opacity: number }[];
  nodes: { id: string; geometryId: string; materialId: string; position: Vec3; rotation: Vec3; scale: Vec3 }[];
  lights: { id: string; kind: "point" | "spot"; color: string; intensity: number; distance: number; position: Vec3 }[];
  emitters: { id: string; kind: "sparkle" | "mist" | "fireflies"; position: Vec3; color: string; maxParticles: number; rate: number; lifetime: number; size: number }[];
  behaviors: { id: string; kind: "float" | "orbit" | "wander" | "pulse" | "follow-citizen" | "flee"; targetId: string; speed: number; amplitude: number; radius: number; citizenId?: string }[];
}

export const SPEC_LIMITS = Object.freeze({ maxBytes: 32_768, maxScaledAxis: 24, minY: -8, maxY: 48 });
const validate = new Ajv2020({ strict: true, allErrors: true }).compile<SceneSpec>(schema);

/** Data contract only; moderation, global admission and materialization are later phases. */
export function parseSceneSpec(json: string): SceneSpec {
  if (Buffer.byteLength(json, "utf8") > SPEC_LIMITS.maxBytes) throw new Error("Scene Spec exceeds 32 KiB");
  const value: unknown = JSON.parse(json);
  if (!validate(value)) throw new Error(`Invalid Scene Spec: ${JSON.stringify(validate.errors)}`);
  const ids = new Set<string>();
  for (const item of [...value.geometries, ...value.materials, ...value.nodes, ...value.lights, ...value.emitters, ...value.behaviors]) {
    if (ids.has(item.id)) throw new Error(`Duplicate ID: ${item.id}`);
    ids.add(item.id);
  }
  const geometries = new Map(value.geometries.map(item => [item.id, item]));
  const materials = new Set(value.materials.map(item => item.id));
  const nodes = new Set(value.nodes.map(item => item.id));
  for (const node of value.nodes) {
    const geometry = geometries.get(node.geometryId);
    if (!geometry || !materials.has(node.materialId)) throw new Error(`Unknown node reference: ${node.id}`);
    if (geometry.size.some((size, axis) => size * node.scale[axis]! > SPEC_LIMITS.maxScaledAxis)) {
      throw new Error(`Scaled dimension exceeds 24 units: ${node.id}`);
    }
  }
  for (const behavior of value.behaviors) {
    if (!nodes.has(behavior.targetId)) throw new Error(`Unknown behavior target: ${behavior.id}`);
  }
  for (const item of [...value.nodes, ...value.lights, ...value.emitters]) {
    if (item.position[1] < SPEC_LIMITS.minY || item.position[1] > SPEC_LIMITS.maxY) {
      throw new Error(`Y position out of bounds: ${item.id}`);
    }
  }
  return value;
}

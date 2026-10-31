import type { ValidateFunction } from "ajv";
import { validateSceneData, validateSceneStructure } from "../../world/engine/scene-validators.generated.js";
import { Box3, Euler, Matrix4, Vector3 } from "three";
import { triangleCost } from "../../world/engine/spec-geometry.js";
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
const validate = validateSceneData as ValidateFunction<SceneSpec>;

/** Strict canonical validation shared by Node and browser; never strips unknown fields. */
export function parseSceneSpec(json: string): SceneSpec {
  if (new TextEncoder().encode(json).length > SPEC_LIMITS.maxBytes) throw new Error("Scene Spec exceeds 32 KiB");
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
  checkEnvelope(value);
  return value;
}

export function nodeEnvelope(spec: SceneSpec, node: SceneSpec["nodes"][number]) {
  const geometry = spec.geometries.find(g => g.id === node.geometryId)!;
  const pulse = spec.behaviors.filter(b => b.targetId === node.id && b.kind === "pulse")
    .reduce((factor, b) => factor * (1 + Math.min(0.5, b.amplitude * 0.1)), 1);
  const half = new Vector3(...geometry.size).multiply(new Vector3(...node.scale)).multiplyScalar(0.5 * pulse);
  const box = new Box3(half.clone().negate(), half).applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(...node.rotation)));
  const extent = box.max.clone();
  for (const b of spec.behaviors.filter(b => b.targetId === node.id)) {
    if (b.kind === "float") extent.y += b.amplitude;
    if (b.kind === "orbit" || b.kind === "wander") { extent.x += b.radius; extent.z += b.radius; }
  }
  return extent;
}
export function specUsage(spec: SceneSpec) {
  const geometries = new Map(spec.geometries.map(g => [g.id, g]));
  return { nodes: spec.nodes.length, triangles: spec.nodes.reduce((n, node) => {
    const g = geometries.get(node.geometryId)!; return n + triangleCost(g.kind, g.detail);
  }, 0), draws: spec.nodes.length + spec.emitters.length, lights: spec.lights.length,
    particles: spec.emitters.reduce((n, emitter) => n + emitter.maxParticles, 0) };
}
function checkEnvelope(spec: SceneSpec) {
  for (const node of spec.nodes) {
    const e = nodeEnvelope(spec, node);
    const [x, y, z] = node.position;
    if (x - e.x < -64 || x + e.x > 64 || z - e.z < -64 || z + e.z > 64 || y - e.y < -8 || y + e.y > 48) throw new Error("Transformed or animated node exceeds world bounds");
  }
  for (const item of [...spec.lights, ...spec.emitters]) {
    const radius = "distance" in item ? item.distance : item.size + item.lifetime * 0.2;
    const [x, y, z] = item.position;
    if (x - radius < -64 || x + radius > 64 || z - radius < -64 || z + radius > 64 || y - radius < -8 || y + radius > 48) throw new Error("Light or emitter exceeds world bounds");
  }
  const usage = specUsage(spec);
  if (usage.triangles > 50_000 || usage.draws > 64 || usage.particles > 512) throw new Error("Scene workload exceeds hard limits");
}
const structural = validateSceneStructure as ValidateFunction<SceneSpec>;
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));

/** Clamp finite numeric data only. Counts, types, keys, references and IDs always reject. */
export function normalizeSceneSpec(json: string): { spec: SceneSpec; clamped: boolean } {
  if (new TextEncoder().encode(json).length > SPEC_LIMITS.maxBytes) throw new Error("Scene Spec exceeds 32 KiB");
  const value: unknown = JSON.parse(json);
  if (!structural(value)) throw new Error("Scene Spec structure is invalid");
  const before = JSON.stringify(value);
  const definitions = schema.$defs as Record<string, unknown>;
  function visit(input: unknown, rule: unknown): unknown {
    const r = rule as { $ref?: string; type?: string; minimum?: number; maximum?: number; items?: unknown; properties?: Record<string, unknown> };
    if (r.$ref) return visit(input, definitions[r.$ref.split("/").at(-1)!]);
    if (r.type === "number" || r.type === "integer") return clamp(input as number, r.minimum ?? -Infinity, r.maximum ?? Infinity);
    if (Array.isArray(input)) return input.map(item => visit(item, r.items));
    if (input && typeof input === "object" && r.properties) return Object.fromEntries(Object.entries(input).map(([key, item]) => [key, visit(item, r.properties![key])]));
    return input;
  }
  const spec = visit(value, schema) as SceneSpec;
  for (const node of spec.nodes) {
    const geometry = spec.geometries.find(g => g.id === node.geometryId);
    if (!geometry) throw new Error("Unknown node reference");
    const pulse = spec.behaviors.filter(b => b.targetId === node.id && b.kind === "pulse").reduce((f, b) => f * (1 + Math.min(0.5, b.amplitude * 0.1)), 1);
    node.scale = node.scale.map((n, axis) => Math.min(n, 24 / geometry.size[axis]! / pulse)) as Vec3;
    const e = nodeEnvelope(spec, node);
    if (e.x > 64 || e.z > 64 || e.y > 28) throw new Error("Animation envelope cannot fit world bounds");
    node.position = [clamp(node.position[0], -64 + e.x, 64 - e.x), clamp(node.position[1], -8 + e.y, 48 - e.y), clamp(node.position[2], -64 + e.z, 64 - e.z)];
  }
  for (const item of [...spec.lights, ...spec.emitters]) {
    if ("distance" in item) item.distance = Math.min(item.distance, 24);
    const r = "distance" in item ? item.distance : item.size + item.lifetime * 0.2;
    item.position = [clamp(item.position[0], -64 + r, 64 - r), clamp(item.position[1], -8 + r, 48 - r), clamp(item.position[2], -64 + r, 64 - r)];
  }
  const encoded = JSON.stringify(spec);
  return { spec: parseSceneSpec(encoded), clamped: encoded !== before };
}

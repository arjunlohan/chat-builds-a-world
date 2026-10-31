import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseSceneSpec, type SceneSpec } from "../server/summon/scene-spec.js";

const spec: SceneSpec = {
  version: 1, name: "Offline shape",
  geometries: [{ id: "shape", kind: "sphere", size: [1, 1, 1], detail: 1 }],
  materials: [{ id: "tint", color: "#79d7cf", emissive: "#000000", emissiveIntensity: 0, roughness: 1, metalness: 0, opacity: 1 }],
  nodes: [{ id: "node", geometryId: "shape", materialId: "tint", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }],
  lights: [], emitters: [], behaviors: [],
};
const parse = (value: unknown) => parseSceneSpec(JSON.stringify(value));
test("accepts a bounded, data-only spec", () => assert.deepEqual(parse(spec), spec));
test("rejects code, unknown fields, unsupported geometry and non-finite numbers", () => {
  assert.throws(() => parse({ ...spec, code: "alert(1)" }));
  const changed = structuredClone(spec);
  Object.assign(changed.geometries[0]!, { kind: "custom-shader" });
  assert.throws(() => parse(changed));
  changed.geometries[0]!.size[0] = Infinity;
  assert.throws(() => parse(changed));
});
test("enforces count, payload and dimension limits", () => {
  assert.throws(() => parse({ ...spec, nodes: Array.from({ length: 65 }, (_, i) => ({ ...spec.nodes[0], id: `node${i}` })) }));
  assert.throws(() => parseSceneSpec(" ".repeat(32_769)));
  const changed = structuredClone(spec);
  changed.nodes[0]!.scale = [8, 8, 8];
  changed.geometries[0]!.size = [12, 12, 12];
  assert.throws(() => parse(changed), /24 units/);
  changed.nodes[0]!.position[1] = 49;
  changed.nodes[0]!.scale = [1, 1, 1];
  assert.throws(() => parse(changed), /Y position/);
});
test("rejects duplicate IDs and dangling references", () => {
  const changed = structuredClone(spec);
  changed.nodes[0]!.id = "shape";
  assert.throws(() => parse(changed), /Duplicate/);
  changed.nodes[0]!.id = "node";
  changed.nodes[0]!.geometryId = "missing";
  assert.throws(() => parse(changed), /Unknown node reference/);
});
test("citizen behaviors require an ID, and every behavior targets an existing node", () => {
  const changed = structuredClone(spec);
  changed.behaviors = [{ id: "move", kind: "follow-citizen", targetId: "node", speed: 1, amplitude: 1, radius: 1 }];
  assert.throws(() => parse(changed));
  changed.behaviors[0]!.citizenId = "sim-viewer";
  assert.doesNotThrow(() => parse(changed));
  changed.behaviors[0]!.targetId = "missing";
  assert.throws(() => parse(changed), /Unknown behavior target/);
});
test("environment template has names only and no credentials", () => {
  const names = readFileSync(".env.example", "utf8").trim().split("\n");
  assert.equal(names.length, 13);
  assert.ok(names.includes("CODEX_BIN"));
  assert.ok(names.every(name => /^[A-Z][A-Z0-9_]*$/.test(name)));
});
test("AGENTS embeds the canonical Scene Spec schema", () => {
  const agents = readFileSync("AGENTS.md", "utf8");
  const embedded = agents.split("```json\n")[1]?.split("\n```")[0];
  assert.ok(embedded);
  assert.deepEqual(JSON.parse(embedded), JSON.parse(readFileSync("server/summon/scene-spec.schema.json", "utf8")));
});

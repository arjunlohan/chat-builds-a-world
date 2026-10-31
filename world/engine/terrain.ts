import { BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from "three";

import { random, terrainHeight, coast } from "./land.js";
export { random, terrainHeight, coast } from "./land.js";

export function createTerrain() {
  const group = new Group();
  group.name = "island • jade terraces and basalt roots";
  const rng = random();
  const positions: number[] = [];
  const colors: number[] = [];
  const jade = new Color("#5b9f7c"), sand = new Color("#d5c69b"), high = new Color("#91b88a");
  const color = new Color();
  const segments = 80, rings = 22;
  const point = (ring: number, segment: number): [number, number, number] => {
    const angle = segment / segments * Math.PI * 2;
    const radius = ring / rings * coast(angle);
    const x = Math.cos(angle) * 10.5 * radius, z = Math.sin(angle) * 8.4 * radius;
    return [x, terrainHeight(x, z), z];
  };
  const triangle = (a: number[], b: number[], c: number[], tint: Color) => {
    positions.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) colors.push(tint.r, tint.g, tint.b);
  };
  for (let ring = 0; ring < rings; ring++) {
    for (let s = 0; s < segments; s++) {
      const a = point(ring, s), b = point(ring + 1, s), c = point(ring + 1, s + 1), d = point(ring, s + 1);
      const y = (a[1] + b[1] + c[1]) / 3;
      color.copy(y < 1.32 ? sand : jade).lerp(high, Math.max(0, y - 1.5) * 0.2).multiplyScalar(0.94 + rng() * 0.12);
      triangle(a, c, b, color);
      if (ring > 0) triangle(a, d, c, color);
    }
  }
  const top = new BufferGeometry();
  top.setAttribute("position", new Float32BufferAttribute(positions, 3));
  top.setAttribute("color", new Float32BufferAttribute(colors, 3));
  top.computeVertexNormals();
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  const surface = new Mesh(top, material);
  surface.receiveShadow = true;
  group.add(surface);

  positions.length = 0;
  colors.length = 0;
  const scales = [1, 1.015, 0.96, 0.79, 0.56, 0.24, 0.015];
  const levels = [0, -0.1, -1.65, -3.1, -4.8, -6.7, -8.6];
  const stone = ["#859997", "#657d86", "#4d6578", "#495971", "#414b65", "#38415c"];
  const wallPoint = (ring: number, s: number): number[] => {
    const a = s / segments * Math.PI * 2, k = coast(a) * scales[ring]!;
    const x = Math.cos(a) * 10.5 * k, z = Math.sin(a) * 8.4 * k;
    return [x + ring * 0.07, ring === 0 ? terrainHeight(x, z) : levels[ring]! + Math.sin(a * 7 + ring) * 0.18, z];
  };
  for (let ring = 0; ring < scales.length - 1; ring++) {
    for (let s = 0; s < segments; s++) {
      color.set(stone[ring]!).multiplyScalar(0.85 + rng() * 0.3);
      const a = wallPoint(ring, s), b = wallPoint(ring + 1, s), c = wallPoint(ring + 1, s + 1), d = wallPoint(ring, s + 1);
      triangle(a, c, b, color);
      triangle(a, d, c, color);
    }
  }
  const sides = new BufferGeometry();
  sides.setAttribute("position", new Float32BufferAttribute(positions, 3));
  sides.setAttribute("color", new Float32BufferAttribute(colors, 3));
  sides.computeVertexNormals();
  const rock = new Mesh(sides, material);
  rock.castShadow = true;
  rock.receiveShadow = true;
  group.add(rock);
  return group;
}

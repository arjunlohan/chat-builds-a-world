import {scannedVegetation} from "./vegetation.js";
import {surfaceMaterial,surfaceNormals} from "./materials.js";
import type {WorldLook} from "./render-profile.js";
import {GARDEN_TREE as TREE} from "../shared/scale.js";
import { batchStaticGarden } from "./static-batch.js";
import { indexGeometry } from "./index-geometry.js";
import {
  BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry, DodecahedronGeometry,
  Float32BufferAttribute, Group, IcosahedronGeometry, InstancedMesh, Mesh,
  MeshStandardMaterial, Object3D, TorusGeometry, Vector3,
} from "three";
import { random, terrainHeight } from "./terrain.js";

/** A small palette, low-poly silhouettes and shared geometry throughout. */
export function createGarden(look:WorldLook="new") {
  const root = new Group();
  root.name = "lantern garden";
  const rng = random(72);
  const transform = new Object3D();
  const color = new Color();
  const stone = surfaceMaterial({ color: "#d4cead", roughness: 0.95, flatShading: true },look,"stone");
  const bark = surfaceMaterial({ color: "#806b6e", roughness: 1, flatShading: true },look,"wood");
  const leaves = surfaceMaterial({ color: "#ffffff", roughness: 0.9, flatShading: true },look,"foliage");
  const amber = surfaceMaterial({ color: "#ffdf99", emissive: "#ffc66b", emissiveIntensity: 2.4, roughness: 0.5 },look);
  const teal = surfaceMaterial({ color: "#b2f5d6", emissive: "#74e1cc", emissiveIntensity: 1.3, roughness: 0.5 },look);

  function instances(geometry: BufferGeometry, material: MeshStandardMaterial, count: number, name: string, shadows = true) {
    const mesh = new InstancedMesh(indexGeometry(surfaceNormals(geometry,look)), material, count);
    mesh.name = name;
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    root.add(mesh);
    return mesh;
  }
  function place(mesh: InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotation = 0) {
    transform.position.set(x, y, z);
    transform.rotation.set(0, rotation, 0);
    transform.scale.set(sx, sy, sz);
    transform.updateMatrix();
    mesh.setMatrixAt(i, transform.matrix);
  }

  const trees: { x: number; z: number; size: number; tint: string }[] = [
    { x: 0.3, z: -3.6, size: TREE.largestSize, tint: "#e8a38f" },
    { x: -5.6, z: -2.9, size: 1.15, tint: "#e2ad8c" },
    { x: 6, z: -3.6, size: 0.9, tint: "#90c8a0" },
    { x: -7, z: 0, size: 0.7, tint: "#91c4aa" },
    { x: 6.5, z: 3, size: 0.8, tint: "#e9ae94" },
    { x: -0.1, z: 5.5, size: 0.65, tint: "#81b9a2" },
    { x: 2.5, z: -6, size: 0.65, tint: "#e6ba96" },
  ];
  const trunks = instances(new CylinderGeometry(0.14, 0.25, 1, look==="classic"?6:12), bark, trees.length * 4, "branch silhouettes");
  const crowns = instances(new IcosahedronGeometry(1, 1), leaves, trees.length * 7, "coral and sage canopies");
  for (const [i, tree] of trees.entries()) {
    const y = terrainHeight(tree.x, tree.z), s = tree.size;
    place(trunks, i * 4, tree.x, y + s * 0.85, tree.z, s, s * 1.9, s);
    for (let j = 0; j < 3; j++) {
      const a = j * Math.PI * 2 / 3 + i;
      transform.position.set(tree.x + Math.cos(a) * s * 0.36, y + s * 1.55, tree.z + Math.sin(a) * s * 0.36);
      transform.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
      transform.scale.set(s * 0.55, s * 1.2, s * 0.55);
      transform.updateMatrix();
      trunks.setMatrixAt(i * 4 + j + 1, transform.matrix);
    }
    for (let j = 0; j < 7; j++) {
      const a = j * 2.4, r = j === 0 ? 0 : 0.8 * s;
      place(crowns, i * 7 + j, tree.x + Math.cos(a) * r, y + s * (TREE.crownCenter + rng() * TREE.crownCenterJitter), tree.z + Math.sin(a) * r,
        s * (0.9 + rng() * 0.25), s * (TREE.crownY + rng() * TREE.crownYJitter), s * (0.85 + rng() * 0.25), a);
      color.set(tree.tint).multiplyScalar(0.85 + rng() * 0.25);
      crowns.setColorAt(i * 7 + j, color);
    }
  }

  const path = new CatmullRomCurve3([
    new Vector3(-7, 0, 3.7), new Vector3(-2.6, 0, 4.5), new Vector3(2.8, 0, 2.8), new Vector3(4.4, 0, -1.5),
  ]);
  const steps = instances(new CylinderGeometry(1, 1.1, 0.16, look==="classic"?7:12), stone, 44, "winding stepping stones");
  for (let i = 0; i < 44; i++) {
    const p = path.getPoint(i / 43);
    const x = p.x + (rng() - 0.5) * 0.12, z = p.z + (rng() - 0.5) * 0.12;
    place(steps, i, x, terrainHeight(x, z) + 0.08, z, 0.27 + rng() * 0.1, 1, 0.31 + rng() * 0.1, rng() * Math.PI);
  }

  const gate = new Group();
  gate.name = "the moon gate";
  gate.position.set(4.5, terrainHeight(4.5, -1.4) + 1.5, -1.4);
  gate.rotation.y = 0.45;
  const arch = new Mesh(new TorusGeometry(1.4, 0.22, look==="classic"?6:12, 48), stone);
  arch.castShadow = true;
  arch.receiveShadow = true;
  const seam = new Mesh(new TorusGeometry(1.17, 0.024, look==="classic"?5:10, 64), teal);
  seam.position.z = 0.05;
  gate.add(arch, seam);
  root.add(gate);

  const lamps: { x: number; z: number }[] = [];
  for (let i = 0; i < 13; i++) {
    const p = path.getPoint(i / 12);
    lamps.push({ x: p.x + (i % 2 ? 0.65 : -0.65), z: p.z + 0.5 });
  }
  const stems = instances(new CylinderGeometry(0.035, 0.06, 0.65, 5), bark, lamps.length, "lantern stems");
  const lanterns = instances(new DodecahedronGeometry(0.14), amber, lamps.length, "warm seed lanterns", false);
  const caps = instances(new CylinderGeometry(0.21, 0.12, 0.12, 6), stone, lamps.length, "lantern caps");
  for (const [i, p] of lamps.entries()) {
    const y = terrainHeight(p.x, p.z);
    place(stems, i, p.x, y + 0.32, p.z, 1, 1, 1);
    place(lanterns, i, p.x, y + 0.73, p.z, 1, 1.3, 1);
    place(caps, i, p.x, y + 0.92, p.z, 1, 1, 1);
  }

  const grassGeometry = new BufferGeometry();
  grassGeometry.setAttribute("position", new Float32BufferAttribute([
    -0.12, 0, 0, 0.12, 0, 0, 0, 0.45, 0,
    0, 0, -0.12, 0, 0, 0.12, 0, 0.36, 0,
  ], 3));
  grassGeometry.computeVertexNormals();
  const grassMaterial = surfaceMaterial({ color: "#a8c994", roughness: 1, side: 2 },look);
  const grass = instances(grassGeometry, grassMaterial, 1100, "meadow • instanced blades", false);
  let n = 0;
  for (let attempt = 0; attempt < 8000 && n < grass.count; attempt++) {
    const x = (rng() - 0.5) * 19, z = (rng() - 0.5) * 15;
    if ((x / 9.6) ** 2 + (z / 7.6) ** 2 > 0.95 || terrainHeight(x, z) < 1.4) continue;
    const s = 0.4 + rng() * 0.8;
    place(grass, n, x, terrainHeight(x, z), z, s, s, s, rng() * Math.PI);
    color.set(rng() < 0.15 ? "#e5ce95" : "#9bc295").multiplyScalar(0.8 + rng() * 0.35);
    grass.setColorAt(n++, color);
  }
  grass.count = n;

  const rocks = instances(new DodecahedronGeometry(1, 0), stone, 95, "shore pebbles and scattered stones");
  for (let i = 0; i < rocks.count; i++) {
    const a = rng() * Math.PI * 2;
    const x = i < 65 ? -2.5 + Math.cos(a) * (3.5 + rng() * 0.25) : (rng() - 0.5) * 17;
    const z = i < 65 ? 1.5 + Math.sin(a) * (2.25 + rng() * 0.15) : (rng() - 0.5) * 12;
    const s = 0.1 + rng() * 0.27;
    place(rocks, i, x, terrainHeight(x, z) + s * 0.2, z, s * 1.5, s, s, a);
    color.set(i % 4 ? "#b2b4a0" : "#d1ceb0");
    rocks.setColorAt(i, color);
  }

  const roots = instances(new CylinderGeometry(0.025, 0.015, 1, 4), leaves, 42, "hanging jade roots", false);
  for (let i = 0; i < roots.count; i++) {
    const a = rng() * Math.PI * 2, length = 0.7 + rng() * 2.4;
    const x = Math.cos(a) * 10.1, z = Math.sin(a) * 8.1;
    place(roots, i, x, -length / 2 + 0.1, z, 1, length, 1);
    roots.setColorAt(i, color.set("#779a89"));
  }
  const islets = instances(new DodecahedronGeometry(1, 0), stone, 9, "distant drifting fragments", false);
  for (let i = 0; i < islets.count; i++) {
    const a = rng() * Math.PI * 2, r = 17 + rng() * 8, s = 0.2 + rng() * 0.7;
    place(islets, i, Math.cos(a) * r, -5 - rng() * 6, Math.sin(a) * r, s * 1.6, s * 2.5, s, a);
    islets.setColorAt(i, color.set("#7d8f9c"));
  }
  for (const mesh of [trunks, crowns, steps, stems, lanterns, caps, grass, rocks, roots, islets]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
  if(look!=="classic")for(const mesh of [trunks,crowns,grass]){mesh.removeFromParent();mesh.geometry.dispose();}
  const batched=batchStaticGarden(root),vegetation=look!=="classic"?scannedVegetation(trees,path):undefined;
  if(vegetation)batched.add(vegetation.root);
  return Object.assign(batched,{update:(time:number,camera:import("three").PerspectiveCamera)=>vegetation?.update(time,camera)});
}

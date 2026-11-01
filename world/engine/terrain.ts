import {terrainMaterial} from "./terrain-material.js";
import {assetModel} from "./asset-bank.js";
import {modelTemplate} from "./model-template.js";
import {surfaceMaterial,surfaceNormals} from "./materials.js";
import type {WorldLook} from "./render-profile.js";
import { BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, InstancedMesh, Object3D } from "three";

import { random, terrainHeight, coast } from "./land.js";
export { random, terrainHeight, coast } from "./land.js";

export function createTerrain(look:WorldLook="new") {
  const group = new Group();
  group.name = "island • jade terraces and basalt roots";
  const rng = random();
  const positions: number[] = [];
  const colors: number[] = [];
  const jade = new Color("#5b9f7c"), sand = new Color("#d5c69b"), high = new Color("#91b88a");
  const color = new Color();
  const segments = look==="classic"?80:96, rings = look==="classic"?22:28;
  const point = (ring: number, segment: number): [number, number, number] => {
    const angle = segment / segments * Math.PI * 2;
    const radius = ring / rings * coast(angle);
    const x = Math.cos(angle) * 10.5 * radius, z = Math.sin(angle) * 8.4 * radius;
    return [x, terrainHeight(x, z), z];
  };
  let topSurface=true;
  const triangle = (a: number[], b: number[], c: number[], tint: Color) => {
    positions.push(...a, ...b, ...c);
    for (const point of [a,b,c]) {
      if(look!=="classic"&&topSurface){color.copy(jade).lerp(sand,1-Math.min(1,Math.max(0,(point[1]!-1.1)/.35))).lerp(high,Math.max(0,point[1]!-1.5)*.2);colors.push(color.r,color.g,color.b);}
      else colors.push(tint.r,tint.g,tint.b);
    }
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
  const material = surfaceMaterial({ vertexColors: true, roughness: 0.95, flatShading: true },look);
  const surface = new Mesh(surfaceNormals(top,look), look==="classic"?material:terrainMaterial());
  surface.castShadow=look!=="classic";
  surface.receiveShadow = true;
  group.add(surface);

  topSurface=false;
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
  const rock = new Mesh(surfaceNormals(sides,look,Math.PI/3), look==="classic"?material:terrainMaterial(true));
  rock.castShadow = true;
  rock.receiveShadow = true;
  group.add(rock);
  if(look!=="classic"&&assetModel('rock')){
    const model=modelTemplate('rock',true),materials=model.materials.map(m=>{const n=m.clone();n.color.multiplyScalar(.85);n.envMapIntensity=.55;n.roughness=.94;return n;});
    const outcrops=new InstancedMesh(model.geometry.clone(),materials,16),dummy=new Object3D();outcrops.name="scanned basalt buttresses";
    for(let i=0;i<16;i++){const a=i/16*Math.PI*2,r=.78+Math.sin(i*2.2)*.06;dummy.position.set(Math.cos(a)*10.5*coast(a)*r,-3.5+rng()*.6,Math.sin(a)*8.4*coast(a)*r);dummy.rotation.set(.1*Math.sin(a),a,.12*Math.cos(a));dummy.scale.set(1.4+rng(),2.6+rng()*1.2,1.3+rng()*.7);dummy.updateMatrix();outcrops.setMatrixAt(i,dummy.matrix);}outcrops.castShadow=true;outcrops.receiveShadow=true;outcrops.computeBoundingSphere();group.add(outcrops);
  }
  return group;
}

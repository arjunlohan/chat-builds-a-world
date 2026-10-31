import {
  Color, ConeGeometry, DynamicDrawUsage, Group, IcosahedronGeometry,
  InstancedBufferAttribute, InstancedMesh, MeshStandardMaterial, Object3D, Sphere, Vector3,
  type PerspectiveCamera,
} from "three";
import type { Citizen, WorldServices } from "./api.js";
import type { CitizenState } from "../../server/contracts.js";
import { hash, terrainHeight } from "./land.js";
import { stepOnLand } from "./navigation.js";

const LIMIT = 300, IDLE_MS = 20 * 60_000, FADE_MS = 5000;
interface Creature {
  state: CitizenState; position: Vector3; phase: number; yaw: number; born: number;
  label: HTMLDivElement; name: HTMLSpanElement; bubble: HTMLSpanElement;
}
interface Part { mesh: InstancedMesh; fade: InstancedBufferAttribute; copies: number }

/** Six shared instanced meshes for the entire crowd; no per-citizen Three objects. */
export class Citizens {
  readonly root = new Group();
  private readonly items: Creature[] = [];
  private readonly byId = new Map<string, Creature>();
  private readonly parts: Part[] = [];
  private readonly transform = new Object3D();
  private readonly tint = new Color();
  private readonly projection = new Vector3();
  private labelTime = 0;
  private dirtyColor = false;
  private readonly speakers = new Set<string>();
  private readonly body: Part;
  private readonly face: Part;
  private readonly ears: Part;
  private readonly eyes: Part;
  private readonly paws: Part;
  private readonly tails: Part;

  constructor(private readonly labels: HTMLElement) {
    this.root.name = "citizens • 300 reserved creature slots";
    const make = (geometry: IcosahedronGeometry | ConeGeometry, color: string, copies: number, name: string, shadows = false) => {
      const material = new MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });
      material.onBeforeCompile = shader => {
        shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute float aFade; varying float vFade;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFade = aFade;");
        shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vFade;")
          .replace("#include <alphatest_fragment>", `#include <alphatest_fragment>
            if (vFade < 0.999 && fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233))) * 43758.5453) > vFade) discard;`);
      };
      material.customProgramCacheKey = () => "citizen-dither-v1";
      const fade = new InstancedBufferAttribute(new Float32Array(LIMIT * copies).fill(1), 1);
      fade.setUsage(DynamicDrawUsage);
      geometry.setAttribute("aFade", fade);
      const mesh = new InstancedMesh(geometry, material, LIMIT * copies);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.boundingSphere = new Sphere(new Vector3(0, 3, 0), 24);
      mesh.name = name; mesh.castShadow = shadows; mesh.receiveShadow = true;
      this.root.add(mesh);
      const part = { mesh, fade, copies };
      this.parts.push(part);
      return part;
    };
    this.body = make(new IcosahedronGeometry(1, 1), "#ffffff", 1, "citizen bodies", true);
    this.face = make(new IcosahedronGeometry(1, 1), "#f4e6c5", 1, "cream faces");
    this.ears = make(new ConeGeometry(1, 1, 5), "#ffffff", 2, "colored ears");
    this.eyes = make(new IcosahedronGeometry(1, 0), "#283b42", 2, "eyes");
    this.paws = make(new IcosahedronGeometry(1, 0), "#eee1bf", 2, "paws");
    this.tails = make(new IcosahedronGeometry(1, 0), "#ffffff", 1, "colored tails");
    // Counts initially reserve all 300 slots in the global resource ledger.
    // The first update sets each draw count to the actual roster before rendering.
  }
  get count() { return this.items.length; }
  get ids() { return this.items.map(c => c.state.id); }
  readonly services: WorldServices["citizens"] = {
    get: id => { const c = this.byId.get(id); return c ? this.snapshot(c) : undefined; },
    list: () => Object.freeze(this.items.map(c => this.snapshot(c))),
  };
  private snapshot(c: Creature): Citizen {
    return Object.freeze({ id: c.state.id, displayName: c.state.displayName, color: c.state.color, position: Object.freeze(c.position.clone()) });
  }
  upsert(state: CitizenState, now: number) {
    let c = this.byId.get(state.id);
    const spawned = !c;
    if (!c) {
      if (this.count >= LIMIT) return undefined;
      const label = document.createElement("div"), name = document.createElement("span"), bubble = document.createElement("span");
      label.className = "citizen-label"; name.className = "citizen-name"; bubble.className = "citizen-bubble";
      label.dataset.userId = state.id; label.hidden = true;
      label.append(bubble, name); this.labels.append(label);
      const phase = hash(state.id) / 4294967296 * Math.PI * 2;
      c = { state, position: new Vector3(...state.home), phase, yaw: phase, born: now, label, name, bubble };
      this.items.push(c); this.byId.set(state.id, c);
    }
    c.state = state;
    this.speakers.delete(state.id); this.speakers.add(state.id);
    if (this.speakers.size > 16) this.speakers.delete(this.speakers.keys().next().value!);
    c.name.textContent = state.displayName;
    c.bubble.textContent = state.speech;
    c.label.dataset.command = state.command?.kind ?? "idle";
    c.label.dataset.color = state.color;
    c.label.style.setProperty("--citizen-color", state.color);
    this.dirtyColor = true;
    return spawned ? this.snapshot(c) : undefined;
  }
  sync(states: readonly CitizenState[], now: number) {
    const keep = new Set(states.map(s => s.id));
    this.remove(this.items.filter(c => !keep.has(c.state.id)).map(c => c.state.id));
    for (const state of states.slice(0, LIMIT)) this.upsert(state, now);
  }
  remove(ids: readonly string[]) {
    for (const id of ids) {
      const c = this.byId.get(id);
      if (!c) continue;
      c.label.remove(); this.speakers.delete(id); this.byId.delete(id); this.items.splice(this.items.indexOf(c), 1);
    }
    this.dirtyColor = true;
  }
  private place(part: Part, index: number, c: Creature, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, opacity: number) {
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    this.transform.position.set(c.position.x + x * cos + z * sin, c.position.y + y, c.position.z - x * sin + z * cos);
    this.transform.rotation.set(0, yaw, 0); this.transform.scale.set(sx, sy, sz); this.transform.updateMatrix();
    part.mesh.setMatrixAt(index, this.transform.matrix); part.fade.setX(index, opacity);
  }
  update(dt: number, time: number, now: number, camera: PerspectiveCamera, reducedMotion: boolean) {
    this.labelTime += dt;
    const project = this.labelTime >= 0.05;
    if (project) this.labelTime = 0;
    for (let i = 0; i < this.items.length; i++) {
      const c = this.items[i]!, s = c.state;
      const age = Math.max(0, (now - s.commandAt) / 1000);
      const command = s.command;
      let targetX = s.home[0], targetZ = s.home[2], speed = 0.35;
      if (command?.kind === "follow") {
        const target = this.byId.get(command.targetId);
        if (target) {
          const dx = target.position.x - c.position.x, dz = target.position.z - c.position.z;
          const length = Math.hypot(dx, dz);
          if (length > 0.85) { targetX = target.position.x - dx / length * 0.85; targetZ = target.position.z - dz / length * 0.85; }
          else { targetX = c.position.x; targetZ = c.position.z; }
          speed = 1.1;
        } else { targetX = c.position.x; targetZ = c.position.z; }
      } else if (command?.kind === "home") speed = 1.4;
      else if (!reducedMotion) { targetX += Math.sin(time * 0.18 + c.phase) * 0.22; targetZ += Math.cos(time * 0.15 + c.phase) * 0.22; }
      const dx = targetX - c.position.x, dz = targetZ - c.position.z, length = Math.hypot(dx, dz);
      const moving = length > 0.04;
      if (moving) {
        const beforeX = c.position.x, beforeZ = c.position.z;
        stepOnLand(c.position, targetX, targetZ, speed * dt);
        const heading = Math.atan2(c.position.x - beforeX, c.position.z - beforeZ);
        c.yaw += Math.atan2(Math.sin(heading - c.yaw), Math.cos(heading - c.yaw)) * Math.min(1, dt * 5);
      }
      const jumping = command?.kind === "jump" && age < 1.15;
      const dancing = command?.kind === "dance" && age < 8;
      const jump = jumping && !reducedMotion ? Math.sin(age / 1.15 * Math.PI) * 0.85 : 0;
      const bob = reducedMotion ? 0 : moving ? Math.abs(Math.sin(time * 8 + c.phase)) * 0.035 : Math.sin(time * 2 + c.phase) * 0.012;
      const yaw = c.yaw + (dancing && !reducedMotion ? Math.sin(age * 9) * 0.6 : 0);
      c.position.y = terrainHeight(c.position.x, c.position.z) + jump + bob;
      const fade = Math.max(0, Math.min(1, 1 - (now - s.lastActive - IDLE_MS) / FADE_MS));
      const arrival = reducedMotion ? 1 : 0.9 + Math.max(0, Math.min(1, (now - c.born) / 400)) * 0.1;
      const bounce = dancing && !reducedMotion ? Math.sin(age * 12) * 0.025 : 0;
      this.place(this.body, i, c, 0, 0.31 + bounce, 0, 0.24 * arrival, (0.3 + bounce) * arrival, 0.21 * arrival, yaw, fade);
      this.place(this.face, i, c, 0, 0.34, 0.16, 0.175 * arrival, 0.145 * arrival, 0.075 * arrival, yaw, fade);
      this.place(this.tails, i, c, 0, 0.22, -0.23, 0.09 * arrival, 0.09 * arrival, 0.09 * arrival, yaw, fade);
      for (let j = 0; j < 2; j++) {
        const side = j ? 1 : -1;
        this.place(this.ears, i * 2 + j, c, side * 0.125, 0.64, 0, 0.08 * arrival, 0.24 * arrival, 0.065 * arrival, yaw, fade);
        this.place(this.eyes, i * 2 + j, c, side * 0.065, 0.385, 0.225, 0.024 * arrival, 0.032 * arrival, 0.018 * arrival, yaw, fade);
        this.place(this.paws, i * 2 + j, c, side * 0.12, 0.055, 0.06, 0.095 * arrival, 0.055 * arrival, 0.12 * arrival, yaw, fade);
      }
      if (this.dirtyColor) {
        this.tint.set(s.color);
        this.body.mesh.setColorAt(i, this.tint); this.tails.mesh.setColorAt(i, this.tint);
        for (let j = 0; j < 2; j++) this.ears.mesh.setColorAt(i * 2 + j, this.tint);
      }
      if (project) {
        this.projection.copy(c.position); this.projection.y += 1.0; this.projection.project(camera);
        const visible = this.projection.z > -1 && this.projection.z < 1 && Math.abs(this.projection.x) < 1.05 && Math.abs(this.projection.y) < 1.05;
        c.label.hidden = !visible;
        if (visible) {
          c.label.style.transform = `translate3d(${((this.projection.x + 1) * 960).toFixed(1)}px,${((1 - this.projection.y) * 540).toFixed(1)}px,0) translate(-50%,-100%)`;
          c.label.style.opacity = String(fade);
          const speaking = now - s.speechAt < 5500 && this.speakers.has(s.id);
          c.bubble.hidden = !speaking;
        }
      }
    }
    for (const part of this.parts) {
      part.mesh.count = this.count * part.copies; part.mesh.instanceMatrix.needsUpdate = true; part.fade.needsUpdate = true;
      if (this.dirtyColor && part.mesh.instanceColor) part.mesh.instanceColor.needsUpdate = true;
    }
    this.dirtyColor = false;
  }
  dispose() { for (const c of this.items) c.label.remove(); this.items.length = 0; this.byId.clear(); }
}

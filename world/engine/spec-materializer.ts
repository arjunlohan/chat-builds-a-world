import {kitMaterial} from "./materials.js";
import {isModelKind} from "../shared/model-kit.js";
import {modelTemplate} from "./model-template.js";
import {cloneModelMaterial} from "./pbr-kit.js";
import {Texture} from "three";
import type {WorldLook} from "./render-profile.js";
import { SUMMON_COUNT, clampToWorld, RenderFailure } from "../shared/limits.js";
import {
  AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Group, Mesh,
  MeshStandardMaterial, Object3D, PointLight, Points, ShaderMaterial, SpotLight, Vector3,
  type PerspectiveCamera,
} from "three";
import { parseSceneSpec, nodeEnvelope, type SceneSpec } from "../../server/summon/scene-spec.js";
import type { SummonState } from "../../server/contracts.js";
import type { SpawnHandle, WorldServices } from "./api.js";
import { createSpecGeometry } from "./spec-geometry.js";
import { ResourceLedger, ResourceOwner, type Usage } from "./resources.js";
import { LabelManager, projectLabel } from "./labels.js";
import { hash, random } from "./land.js";

interface NodeState { mesh: Mesh; base: Vector3; scale: Vector3; extent: Vector3; drift: Vector3; offset: Vector3; pulse: number }
interface Entry {
  id: string; root: Group; owner: ResourceOwner; usage: Usage; spec: SceneSpec; nodes: Map<string, NodeState>;
  center: Vector3; anchor: Vector3; born: number; emitters: { uTime: { value: number } }[];
  metadata?: SummonState; label?: HTMLElement; removeLabel?: () => void; needsAck: boolean; spawnPending: boolean;
}
export interface MaterializerOptions {
  look?:WorldLook;
  root: Object3D; ledger: ResourceLedger; layout: LabelManager; labels: HTMLElement;
  effects: WorldServices["effects"]; camera: WorldServices["camera"]; citizens: WorldServices["citizens"];
  onVisible?: (state: SummonState) => void;
  onSceneChange?: () => void;
}
export interface SpecHandle extends SpawnHandle { readonly usage: Usage; readonly root: Group }

export class SpecMaterializer {
  private readonly entries = new Map<string, Entry>();
  private readonly projection = new Vector3();
  private time = 0;
  private sequence = 0;
  constructor(private readonly options: MaterializerOptions) {}
  get count() { return this.entries.size; }
  spawn(input: SceneSpec, metadata?: SummonState, restore = false): SpecHandle {
    let spec: SceneSpec; try { spec = parseSceneSpec(JSON.stringify(input)); } catch { throw new RenderFailure("invalid-spec"); }
    if (metadata && [...this.entries.values()].filter(e => e.metadata).length >= SUMMON_COUNT) throw new RenderFailure("capacity");
    const id = metadata?.id ?? `module-spec-${++this.sequence}`;
    if (this.entries.has(id)) return { id, root: this.entries.get(id)!.root, usage: this.entries.get(id)!.usage, dispose: () => this.remove(id) };
    const root = new Group(), owner = new ResourceOwner();
    root.name = `scene-spec:${id}`;
    try {
      const geometries = new Map(spec.geometries.map(g => { const geometry = createSpecGeometry(g,this.options.look); owner.geometries.add(geometry); return [g.id, geometry]; }));
      const materials = new Map(spec.materials.map(m => {
        const material = kitMaterial({ color: m.color, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity,
          roughness: m.roughness, metalness: m.metalness, opacity: m.opacity, transparent: m.opacity < 1, flatShading: true, side: 2 },m.preset,this.options.look??"new");
        owner.ownMaterial(material); return [m.id, material];
      }));
      const nodes = new Map<string, NodeState>(),models=new Map<string,MeshStandardMaterial[]>(),textureCopies=new Map<Texture,Texture>();
      for (const n of spec.nodes) {
        const geometry=spec.geometries.find(g=>g.id===n.geometryId)!,request=spec.materials.find(m=>m.id===n.materialId)!;
        let material:MeshStandardMaterial|MeshStandardMaterial[]=materials.get(n.materialId)!;
        if(this.options.look!=="classic"&&isModelKind(geometry.kind)){
          const key=geometry.id+":"+request.id;let native=models.get(key);if(!native){native=modelTemplate(geometry.kind,geometry.detail===0).materials.map(source=>{const m=cloneModelMaterial(source,request.color,request.opacity,request.emissive,request.emissiveIntensity,textureCopies);owner.ownMaterial(m);return m;});models.set(key,native);}material=native;
        }
        const mesh = new Mesh(geometries.get(n.geometryId)!,material);
        mesh.position.set(...n.position); mesh.rotation.set(...n.rotation); mesh.scale.set(...n.scale);
        mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
        nodes.set(n.id, { mesh, base: mesh.position.clone(), scale: mesh.scale.clone(), extent: nodeEnvelope(spec, n), drift: new Vector3(), offset: new Vector3(), pulse: 1 });
      }
      for (const light of spec.lights) {
        const object = light.kind === "point" ? new PointLight(light.color, light.intensity, light.distance) : new SpotLight(light.color, light.intensity, light.distance, Math.PI / 5, 0.5);
        object.position.set(...light.position); object.castShadow = false; root.add(object);
        if (object instanceof SpotLight) { const target = new Object3D(); target.position.copy(object.position); target.position.y -= 1; root.add(target); object.target = target; }
      }
      const emitters: Entry["emitters"] = [];
      for (const emitter of spec.emitters) {
        const rng = random(hash(id + emitter.id)), positions: number[] = [], phases: number[] = [];
        for (let i = 0; i < emitter.maxParticles; i++) { positions.push((rng() - 0.5) * 2, rng(), (rng() - 0.5) * 2); phases.push(rng()); }
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new Float32BufferAttribute(positions, 3)); geometry.setAttribute("aPhase", new Float32BufferAttribute(phases, 1));
        const uniforms = { uTime: { value: 0 }, uLife: { value: emitter.lifetime }, uRate: { value: emitter.rate },
          uSize: { value: emitter.size }, uColor: { value: new Color(emitter.color) }, uRadius: { value: emitter.lifetime * 0.15 } };
        const material = new ShaderMaterial({ uniforms, transparent: true, depthWrite: false, blending: AdditiveBlending,
          vertexShader: `uniform float uTime,uLife,uRate,uSize,uRadius; attribute float aPhase; varying float vAlpha;
            void main(){float age=fract(uTime/uLife+aPhase); vec3 p=position*uRadius;
            p.y=age*uRadius; p.x+=sin(uTime*0.4+aPhase*6.28)*uRadius*0.15;
            vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv;
            gl_PointSize=clamp(uSize*700.0/-mv.z,1.0,14.0); vAlpha=sin(age*3.14159)*step(aPhase,uRate*uLife/128.0);}`,
          fragmentShader: `uniform vec3 uColor; varying float vAlpha;
            void main(){float r=length(gl_PointCoord-0.5)*2.0; if(r>1.0)discard; gl_FragColor=vec4(uColor*1.4,pow(1.0-r,2.0)*vAlpha);}`,
        });
        const points = new Points(geometry, material); points.position.set(...emitter.position); points.frustumCulled = false;
        root.add(points); emitters.push(uniforms);
      }
      const usage = owner.audit(root);
      this.options.ledger.reserve(`spec:${id}`, usage);
      const center = new Vector3(); for (const node of nodes.values()) center.add(node.base); center.divideScalar(nodes.size);
      const entry: Entry = { id, root, owner, usage, spec, nodes, center, anchor: center.clone(), born: this.time, emitters, needsAck: !!metadata, spawnPending: !!metadata && !restore, ...(metadata ? { metadata } : {}) };
      this.entries.set(id, entry); this.options.root.add(root); this.options.onSceneChange?.();
      if (metadata) {
        const label = document.createElement("div"); label.className = "summon-label"; label.hidden = true;
        label.dataset.summonId = id; label.dataset.requester = metadata.requester; label.dataset.spawnEffect = restore ? "restored" : "pending";
        label.textContent = spec.name;
        const credit = document.createElement("small"); credit.textContent = `by ${metadata.requester}`; label.append(credit);
        this.options.labels.append(label); entry.label = label;
        const order = ++this.sequence;
        entry.removeLabel = this.options.layout.add(`summon:${id}`, label, (candidate, _now, camera) => {
          if(!projectLabel(entry.anchor,camera,candidate))return;
          candidate.width=240;candidate.height=46;candidate.kind="summon";candidate.priority=1200+order;candidate.opacity=1;return true;
        });
      }
      if (!restore) { if (!metadata) this.options.effects.play("spawn", center); this.options.camera.focus(center, { duration: 2.5, priority: 3 }); }
      return { id, root, usage, dispose: () => this.remove(id) };
    } catch (error) {
      this.entries.get(id)?.removeLabel?.();
      this.options.ledger.release(`spec:${id}`); owner.audit(root); owner.dispose(root); this.entries.delete(id);
      throw error instanceof RenderFailure ? error : new RenderFailure("allocation");
    }
  }
  update(dt: number, camera: PerspectiveCamera, reducedMotion: boolean) {
    this.time += dt;
    for (const entry of this.entries.values()) {
      const time = reducedMotion ? 0 : this.time - entry.born;
      for (const node of entry.nodes.values()) { node.offset.set(0, 0, 0); node.pulse = 1; }
      for (const b of entry.spec.behaviors) {
        const node = entry.nodes.get(b.targetId)!;
        const t = time * b.speed;
        if (b.kind === "float") node.offset.y += Math.sin(t) * b.amplitude;
        else if (b.kind === "orbit") { node.offset.x += Math.cos(t) * b.radius; node.offset.z += Math.sin(t) * b.radius; }
        else if (b.kind === "wander") { node.offset.x += Math.sin(t * 0.23) * b.radius; node.offset.z += Math.cos(t * 0.17) * b.radius; }
        else if (b.kind === "pulse") node.pulse *= 1 + Math.sin(t) * Math.min(0.5, b.amplitude * 0.1);
        else {
          const citizen = this.options.citizens.get(b.citizenId!);
          if (citizen && !reducedMotion) {
            const dx = citizen.position.x - node.base.x - node.drift.x, dz = citizen.position.z - node.base.z - node.drift.z;
            const distance = Math.hypot(dx, dz);
            const step = b.speed * dt;
            if (distance > 0.01 && (b.kind === "follow-citizen" || distance < b.radius)) {
              const sign = b.kind === "flee" ? -1 : 1;
              node.drift.x += dx / distance * Math.min(step, distance) * sign;
              node.drift.z += dz / distance * Math.min(step, distance) * sign;
            }
          }
        }
      }
      entry.center.set(0, 0, 0); let top = -Infinity;
      for (const node of entry.nodes.values()) {
        node.mesh.position.copy(node.base).add(node.drift).add(node.offset);
        clampToWorld(node.mesh.position,node.extent);
        node.mesh.scale.copy(node.scale).multiplyScalar(node.pulse);
        entry.center.add(node.mesh.position); top = Math.max(top, node.mesh.position.y + node.extent.y);
      }
      entry.center.divideScalar(entry.nodes.size); entry.anchor.copy(entry.center); entry.anchor.y = top + 0.35;
      for (const emitter of entry.emitters) emitter.uTime.value = time;
    }
  }
  private onScreen(entry: Entry, camera: PerspectiveCamera) {
    if (!entry.label || entry.label.hidden) return false; this.projection.copy(entry.center).project(camera);
    return Math.abs(this.projection.x)<=1 && Math.abs(this.projection.y)<=1 && Math.abs(this.projection.z)<=1;
  }
  beforeRender(camera: PerspectiveCamera) {
    for (const entry of this.entries.values()) if (entry.spawnPending && entry.label && !entry.label.hidden) {
      if (!this.onScreen(entry,camera)) continue;
      this.options.effects.play("spawn", entry.center); entry.spawnPending = false; entry.label.dataset.spawnEffect = "played";
    }
  }
  /** Called after compositing; the next RAF receipt is after the first visible paint. */
  rendered(camera: PerspectiveCamera) {
    for (const entry of this.entries.values()) if (entry.needsAck && entry.metadata && entry.label && !entry.label.hidden) {
      if (!this.onScreen(entry,camera)) continue;
      entry.needsAck = false;
      const metadata = entry.metadata;
      requestAnimationFrame(() => { if (this.entries.has(entry.id) && !document.hidden) this.options.onVisible?.(metadata); });
    }
  }
  sync(scenes: readonly SummonState[]) {
    const ids = new Set(scenes.map(s => s.id));
    for (const entry of this.entries.values()) if (entry.metadata && !ids.has(entry.id)) this.remove(entry.id);
    const rejected: {state: SummonState; code: string}[] = [];
    for (const scene of scenes) if (!this.entries.has(scene.id)) { try { this.spawn(scene.spec, scene, true); } catch (error) { rejected.push({state: scene, code: error instanceof RenderFailure ? error.code : "render-error"}); } }
    return rejected;
  }
  remove(id: string) {
    const entry = this.entries.get(id); if (!entry) return;
    this.options.onSceneChange?.(); entry.removeLabel?.(); entry.owner.dispose(entry.root); this.options.ledger.release(`spec:${id}`); this.entries.delete(id);
  }
  dispose() { for (const id of this.entries.keys()) this.remove(id); }
}

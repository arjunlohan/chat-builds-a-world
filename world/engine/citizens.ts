import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { indexGeometry } from "./index-geometry.js";
import { CITIZEN_CAP, IDLE_MS, FADE_MS, inParade } from "../shared/limits.js";
import { isChatCommand } from "../../server/commands.js";
import {
  BufferGeometry, Float32BufferAttribute, Matrix4, Color, ConeGeometry, DynamicDrawUsage, Group, IcosahedronGeometry,
  InstancedBufferAttribute, InstancedMesh, MeshStandardMaterial, Sphere, Vector3,
  type PerspectiveCamera,
} from "three";
import type { Citizen, WorldServices } from "./api.js";
import type { CitizenState } from "../../server/contracts.js";
import { hash, terrainHeight } from "./land.js";
import { LabelManager, citizenLabelMode, projectLabel } from "./labels.js";
import { stepOnLand } from "./navigation.js";

const LIMIT = CITIZEN_CAP;
export const idleFade = (now: number, lastActive: number) => Math.max(0, Math.min(1, 1 - (now - lastActive - IDLE_MS) / FADE_MS));
interface CitizenUI {label:HTMLDivElement;name:HTMLSpanElement;bubble:HTMLSpanElement;remove:()=>void;fullWidth:number;quietWidth:number}
interface Creature {
  snapshot: Citizen | undefined; state: CitizenState; position: Vector3; phase: number; yaw: number; born: number;
  cos: number; sin: number; commandSpeech: boolean; ui?:CitizenUI;
}
/** One instanced geometry retains all six creature parts and their authored palette. */
export class Citizens {
  readonly root = new Group();
  private readonly items: Creature[] = [];
  private readonly byId = new Map<string, Creature>();
  private readonly tint = new Color();
  private readonly measure = document.createElement("canvas").getContext("2d");
  private readonly dirtyColors = new Set<string>();
  private dirtyFirst=Infinity;
  private dirtyLast=-1;
  private frozenList: readonly Citizen[] | undefined;
  private readonly speakers = new Set<string>();
  private readonly body: {mesh:InstancedMesh;fade:InstancedBufferAttribute;bounce:InstancedBufferAttribute;fadeChanged:boolean;bounceChanged:boolean};

  constructor(private readonly labels: HTMLElement, private readonly layout: LabelManager ) {
    this.root.name = "citizens • 300 reserved creature slots";
    const pieces: BufferGeometry[] = [];
    const piece = (geometry: BufferGeometry, tint: boolean, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, body=false) => {
      const g=geometry.index ? geometry.toNonIndexed() : geometry.clone(); geometry.dispose();
      g.applyMatrix4(new Matrix4().makeScale(sx,sy,sz));g.translate(x,y,z);
      const count=g.getAttribute("position").count,c=new Color(color),colors=new Float32Array(count*3);
      for(let i=0;i<count;i++){colors[i*3]=c.r;colors[i*3+1]=c.g;colors[i*3+2]=c.b;}
      g.setAttribute("color",new Float32BufferAttribute(colors,3));g.setAttribute("aTint",new Float32BufferAttribute(new Float32Array(count).fill(Number(tint)),1));
      g.setAttribute("aBody",new Float32BufferAttribute(new Float32Array(count).fill(Number(body)),1));pieces.push(g);
    };
    piece(new IcosahedronGeometry(1,1),true,"#ffffff",0,.31,0,.24,.3,.21,true);
    piece(new IcosahedronGeometry(1,1),false,"#f4e6c5",0,.34,.16,.175,.145,.075);
    piece(new IcosahedronGeometry(1,0),true,"#ffffff",0,.22,-.23,.09,.09,.09);
    for(const side of [-1,1]){
      piece(new ConeGeometry(1,1,5),true,"#ffffff",side*.125,.64,0,.08,.24,.065);
      piece(new IcosahedronGeometry(1,0),false,"#283b42",side*.065,.385,.225,.024,.032,.018);
      piece(new IcosahedronGeometry(1,0),false,"#eee1bf",side*.12,.055,.06,.095,.055,.12);
    }
    const combined=mergeGeometries(pieces)!;for(const g of pieces)g.dispose();
    // Flat shading reconstructs face normals in the fragment shader. Shared vertices cut
    // repeated instance/lighting transforms without changing triangles or silhouettes.
    const normals=combined.getAttribute("normal");for(let i=0;i<normals.count;i++)normals.setXYZ(i,0,1,0);
    const geometry=indexGeometry(combined);
    const fade=new InstancedBufferAttribute(new Float32Array(LIMIT).fill(1),1),bounce=new InstancedBufferAttribute(new Float32Array(LIMIT),1);
    fade.setUsage(DynamicDrawUsage);bounce.setUsage(DynamicDrawUsage);geometry.setAttribute("aFade",fade);geometry.setAttribute("aBounce",bounce);
    const material=new MeshStandardMaterial({color:"#ffffff",vertexColors:true,roughness:.9,flatShading:true});
    material.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace("#include <common>","#include <common>\nattribute float aFade,aBounce,aTint,aBody; varying float vFade;")
        .replace("#include <begin_vertex>","#include <begin_vertex>\nvFade=aFade; transformed.y+=aBody*aBounce*(1.0+(position.y-0.31)/0.3);")
        .replace("#include <color_vertex>","#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\nvColor.rgb=color*mix(vec3(1.0),instanceColor,aTint);\n#endif");
      shader.fragmentShader=shader.fragmentShader.replace("#include <common>","#include <common>\nvarying float vFade;")
        .replace("#include <alphatest_fragment>","#include <alphatest_fragment>\nif(vFade<0.999&&fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)>vFade)discard;");
    };
    material.customProgramCacheKey=()=>"citizen-merged-v2";
    const mesh=new InstancedMesh(geometry,material,LIMIT);mesh.instanceMatrix.setUsage(DynamicDrawUsage);mesh.boundingSphere=new Sphere(new Vector3(0,3,0),24);
    mesh.name="citizens • one shared creature geometry";mesh.castShadow=false;mesh.receiveShadow=true;this.root.add(mesh);
    this.body={mesh,fade,bounce,fadeChanged:false,bounceChanged:false};
  }

  get count() { return this.items.length; }
  readonly services: WorldServices["citizens"] = {
    get: id => { const c = this.byId.get(id); return c ? this.snapshot(c) : undefined; },
    list: () => this.frozenList ??= Object.freeze(this.items.map(c => this.snapshot(c))),
  };
  private snapshot(c: Creature): Citizen {
    return c.snapshot ??= Object.freeze({ id: c.state.id, displayName: c.state.displayName, color: c.state.color, position: Object.freeze(c.position.clone()) });
  }
  upsert(state: CitizenState, now: number) {
    let c = this.byId.get(state.id);
    const spawned = !c;
    if (!c) {
      if (this.count >= LIMIT) return undefined;
      const phase = hash(state.id) / 4294967296 * Math.PI * 2;
      c = { snapshot:undefined, cos:1, sin:0, commandSpeech:false, state, position: state.entry&&inParade(state.entry.at,now)?new Vector3(...state.entry.from):new Vector3(...state.home), phase, yaw: phase, born: state.entry?state.entry.at+state.entry.delay:now };
      const matrix=this.body.mesh.instanceMatrix.array as Float32Array,offset=this.items.length*16;matrix.fill(0,offset,offset+16);matrix[offset+15]=1;
      this.items.push(c); this.byId.set(state.id, c);

    }
    this.frozenList = undefined;
    if (spawned || c.state.color !== state.color || !!c.state.entry !== !!state.entry) this.dirtyColors.add(state.id);
    c.snapshot = undefined; c.state = state; c.commandSpeech = isChatCommand(state.speech);
    this.speakers.delete(state.id); this.speakers.add(state.id);
    if (this.speakers.size > 16) this.speakers.delete(this.speakers.keys().next().value!);
    if(now>=c.born&&!c.ui)this.createLabel(c);
    this.updateLabel(c);
    return spawned ? this.snapshot(c) : undefined;
  }
  private createLabel(c:Creature){
    const state=c.state;
      const label = document.createElement("div"), name = document.createElement("span"), bubble = document.createElement("span");
      label.className = "citizen-label"; name.className = "citizen-name"; bubble.className = "citizen-bubble";
      label.dataset.userId = state.id; label.hidden = true;
      label.append(bubble, name); this.labels.append(label);
    const ui:CitizenUI={label,name,bubble,fullWidth:160,quietWidth:80,remove: this.layout.add(`citizen:${state.id}`, label, (candidate, time, camera, focus) => {
        if(time<c.born)return;
        if(!projectLabel(c.position,camera,candidate,1))return;
        const s = c.state, spokeAge = time - s.speechAt;
        const focused = !!focus && c.position.distanceToSquared(focus) < 3.2;
        const distance = c.position.distanceTo(camera.position);
        const speaking = !!s.speech && !c.commandSpeech && spokeAge < 5500 && this.speakers.has(s.id);
        const mode = speaking ? "speech" : citizenLabelMode(distance, spokeAge, time - c.born, focused);
        if (ui.bubble.hidden !== !speaking) ui.bubble.hidden = !speaking;
        const nameWidth = mode === "quiet" ? ui.quietWidth : ui.fullWidth;
        candidate.width=speaking?Math.max(200,nameWidth):nameWidth;candidate.height=speaking?82:mode==="quiet"?18:26;
        candidate.kind=mode;candidate.opacity=idleFade(time,s.lastActive)*(mode==="quiet"?0.35:1);
        candidate.priority=speaking?2000+Math.max(0,5500-spokeAge)/5500:focused?900:mode==="quiet"?1:100+Math.max(0,30000-spokeAge)/1000+30/Math.max(1,distance);
        return true;
      })};c.ui=ui;
    this.updateLabel(c);
  }
  private updateLabel(c:Creature){
    const ui=c.ui;if(!ui)return;const state=c.state;
    if (this.measure && ui.name.textContent !== state.displayName) {
      this.measure.font = "13px system-ui"; ui.fullWidth = Math.min(500, Math.ceil(this.measure.measureText(state.displayName).width) + 16);
      this.measure.font = "10px system-ui"; ui.quietWidth = Math.min(80, Math.ceil(this.measure.measureText(state.displayName).width) + 10);
    }
    if(ui.name.textContent!==state.displayName)ui.name.textContent=state.displayName;
    if(ui.bubble.textContent!==state.speech)ui.bubble.textContent=state.speech;
    ui.label.dataset.command = state.command?.kind ?? "idle";
    ui.label.dataset.color = state.color;
    ui.label.dataset.visitor = state.entry ? "true" : "false";
    if(ui.label.style.getPropertyValue("--citizen-color")!==state.color)ui.label.style.setProperty("--citizen-color", state.color);
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
      c.ui?.remove(); this.speakers.delete(id); this.byId.delete(id); this.items.splice(this.items.indexOf(c), 1);
    }
    for (const c of this.items) this.dirtyColors.add(c.state.id); this.frozenList = undefined;
  }
  private place(index: number, c: Creature, scale: number, opacity: number) {
    const part=this.body,a=part.mesh.instanceMatrix.array as Float32Array,o=index*16,cos=c.cos*scale,sin=c.sin*scale;
    const moved =
      a[o]!==Math.fround(cos) || a[o+2]!==Math.fround(-sin) || a[o+5]!==Math.fround(scale) ||
      a[o+8]!==Math.fround(sin) || a[o+10]!==Math.fround(cos) ||
      a[o+12]!==Math.fround(c.position.x) || a[o+13]!==Math.fround(c.position.y) || a[o+14]!==Math.fround(c.position.z);
    if(moved){
      a[o]=cos;a[o+2]=-sin;a[o+5]=scale;a[o+8]=sin;a[o+10]=cos;
      a[o+12]=c.position.x;a[o+13]=c.position.y;a[o+14]=c.position.z;
      this.dirtyFirst=Math.min(this.dirtyFirst,index);this.dirtyLast=index;
    }
    if (part.fade.getX(index) !== Math.fround(opacity)) { part.fade.setX(index,opacity); part.fadeChanged = true; }
  }
  update(dt: number, time: number, now: number, camera: PerspectiveCamera, reducedMotion: boolean) {
    this.frozenList = undefined;this.dirtyFirst=Infinity;this.dirtyLast=-1;
    for (let i = 0; i < this.items.length; i++) {
      const c = this.items[i]!, s = c.state; c.snapshot = undefined;
      const age = Math.max(0, (now - s.commandAt) / 1000);
      const command = s.command;
      let targetX = s.home[0], targetZ = s.home[2], speed = s.entry&&inParade(s.entry.at,now)?1.35:0.35;
      const waiting=now<c.born;if(!waiting&&!c.ui)this.createLabel(c);
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
      const moving = !waiting&&length > 0.04;
      if (moving) {
        const beforeX = c.position.x, beforeZ = c.position.z;
        stepOnLand(c.position, targetX, targetZ, speed * dt);
        const heading = Math.atan2(c.position.x - beforeX, c.position.z - beforeZ);
        c.yaw += Math.atan2(Math.sin(heading - c.yaw), Math.cos(heading - c.yaw)) * Math.min(1, dt * 5);
      }
      const jumping = command?.kind === "jump" && age < 1.15;
      const dancing = command?.kind === "dance" && age < 8;
      const jump = jumping && !reducedMotion ? Math.sin(age / 1.15 * Math.PI) * 0.85 : 0;
      const bob = reducedMotion||waiting ? 0 : moving ? Math.abs(Math.sin(time * 8 + c.phase)) * 0.035 : Math.sin(time * 2 + c.phase) * 0.012;
      const yaw = c.yaw + (dancing && !reducedMotion ? Math.sin(age * 9) * 0.6 : 0);
      c.position.y = terrainHeight(c.position.x, c.position.z) + jump + bob;
      c.cos = Math.cos(yaw); c.sin = Math.sin(yaw);
      const fade = idleFade(now, s.lastActive);
      const arrival = waiting ? 0 : reducedMotion ? 1 : 0.9 + Math.max(0, Math.min(1, (now - c.born) / 400)) * 0.1;
      const bounce = dancing && !reducedMotion ? Math.sin(age * 12) * 0.025 : 0;
      this.place(i,c,arrival,fade);
      if(this.body.bounce.getX(i)!==Math.fround(bounce)){this.body.bounce.setX(i,bounce);this.body.bounceChanged=true;}
      if(this.dirtyColors.has(s.id)){this.tint.set(s.entry ? "#53e5c6" : s.color);this.body.mesh.setColorAt(i,this.tint);this.body.mesh.instanceColor?.addUpdateRange(i*3,3);}

    }
    const part=this.body;part.mesh.count=this.count;
    if(this.dirtyLast>=0){part.mesh.instanceMatrix.addUpdateRange(this.dirtyFirst*16,(this.dirtyLast-this.dirtyFirst+1)*16);part.mesh.instanceMatrix.needsUpdate=true;}
    if(part.fadeChanged)part.fade.needsUpdate=true;
    if(part.bounceChanged)part.bounce.needsUpdate=true;
    if(this.dirtyColors.size&&part.mesh.instanceColor)part.mesh.instanceColor.needsUpdate=true;
    part.fadeChanged=part.bounceChanged=false;
    this.dirtyColors.clear();
  }
  dispose() { for (const c of this.items) c.ui?.remove(); this.items.length = 0; this.byId.clear(); }
}

import { AdditiveBlending, CircleGeometry, Color, Group, Mesh, MeshBasicMaterial, ShaderMaterial, TorusGeometry, DoubleSide, type PerspectiveCamera } from "three";
import { RAID_PARADE_MS } from "../shared/limits.js";
import { projectLabel, type LabelManager } from "./labels.js";
import { RAID_ENTRY } from "../shared/landmarks.js";
/** One reusable portal. All geometry/particle capacity is admitted with the base world. */
export function createRaidPortal(labels: HTMLElement, layout: LabelManager) {
 const root=new Group();root.name="raid arrival portal";root.position.set(RAID_ENTRY.x,RAID_ENTRY.y+1.45,RAID_ENTRY.z);root.rotation.y=-.55;root.visible=false;
 const ringGeometry=new TorusGeometry(1.4,.055,6,64),ringMaterial=new MeshBasicMaterial({color:new Color().setRGB(1.8,1.35,.65),transparent:true,opacity:0,toneMapped:false});
 const ring=new Mesh(ringGeometry,ringMaterial),outer=new Mesh(ringGeometry,ringMaterial);outer.scale.setScalar(1.09);outer.rotation.z=.1;root.add(ring,outer);
 const uniforms={uTime:{value:0},uOpen:{value:0}};
 const material=new ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:DoubleSide,blending:AdditiveBlending,
 vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
 fragmentShader:`varying vec2 vUv;uniform float uTime,uOpen;void main(){vec2 p=(vUv-.5)*2.;float r=length(p),a=atan(p.y,p.x);float rim=pow(max(0.,1.-abs(r-.91)*11.),2.);float spiral=pow(.5+.5*sin(a*7.-r*25.+uTime*2.4),5.)*(1.-smoothstep(.2,1.,r));float alpha=(rim*.8+spiral*.32)*uOpen;gl_FragColor=vec4(mix(vec3(.25,1.7,1.45),vec3(1.9,1.35,.6),rim),alpha);}`});
 root.add(new Mesh(new CircleGeometry(1.37,48),material));
 const label=document.createElement("div");label.className="raid-label";label.hidden=true;const title=document.createElement("strong"),detail=document.createElement("span");label.append(title,detail);labels.append(label);
 let opened=-Infinity;
 const remove=layout.add("raid-arrival",label,(candidate,_now,camera:PerspectiveCamera)=>{
  if(!root.visible||!projectLabel(root.position,camera,candidate,2))return;
  candidate.width=380;candidate.height=70;candidate.priority=3000;candidate.kind="summon";candidate.opacity=uniforms.uOpen.value;return true;
 });
 return {root,open(channel:string,admitted:number,viewers:number,time:number){opened=time;title.textContent=`@${channel}`;detail.textContent=`RAID · ${viewers.toLocaleString()} viewers · ${admitted} arriving`;},
 update(time:number,reducedMotion:boolean){const age=time-opened,fade=Math.min(1,Math.max(0,age/.55),Math.max(0,(RAID_PARADE_MS/1000-age)/1.2));root.visible=fade>0;root.scale.setScalar(reducedMotion?1:.9+fade*.1);ringMaterial.opacity=fade;uniforms.uOpen.value=fade;uniforms.uTime.value=reducedMotion?0:time;return root.visible;},dispose(){remove();}};
}

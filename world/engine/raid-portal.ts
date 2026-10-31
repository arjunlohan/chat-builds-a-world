import { AdditiveBlending, CircleGeometry, Color, Float32BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial, Points, ShaderMaterial, TorusGeometry, Vector3, DoubleSide, type PerspectiveCamera } from "three";
import { RAID_PARADE_MS } from "../shared/limits.js";
export { RAID_PARADE_MS } from "../shared/limits.js";
import type { LabelManager } from "./labels.js";
import { terrainHeight } from "./land.js";
export const RAID_ENTRY = Object.freeze({x:-6.5,y:terrainHeight(-6.5,3.8),z:3.8});
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
 const seeds=new Float32Array(128*3);for(let i=0;i<128;i++){const a=i*2.39996;seeds[i*3]=Math.cos(a)*1.48;seeds[i*3+1]=Math.sin(a)*1.48;seeds[i*3+2]=(i%7)*.025;}
 const geometry=new BufferGeometry();geometry.setAttribute("position",new Float32BufferAttribute(seeds,3));
 const sparks=new ShaderMaterial({uniforms,transparent:true,depthWrite:false,blending:AdditiveBlending,
 vertexShader:`uniform float uTime,uOpen;varying float vAlpha;void main(){float phase=position.x*8.+position.y*3.;vec3 p=position;p.xy*=1.+.08*sin(uTime+phase);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(65./-mv.z,1.,5.);vAlpha=uOpen*(.35+.65*pow(.5+.5*sin(uTime*2.+phase),2.));}`,
 fragmentShader:`varying float vAlpha;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;gl_FragColor=vec4(.9,1.8,1.5,(1.-d)*vAlpha);}`});root.add(new Points(geometry,sparks));
 const label=document.createElement("div");label.className="raid-label";label.hidden=true;const title=document.createElement("strong"),detail=document.createElement("span");label.append(title,detail);labels.append(label);
 let opened=-Infinity;const projection=new Vector3();
 const remove=layout.add("raid-arrival",label,(candidate,_now,camera:PerspectiveCamera)=>{
  if(!root.visible)return;projection.copy(root.position);projection.y+=2;projection.project(camera);if(Math.abs(projection.z)>=1)return;
  candidate.x=(projection.x+1)*960;candidate.y=(1-projection.y)*540;candidate.width=380;candidate.height=70;candidate.priority=3000;candidate.kind="summon";candidate.opacity=uniforms.uOpen.value;return true;
 });
 return {root,open(channel:string,admitted:number,viewers:number,time:number){opened=time;title.textContent=`@${channel}`;detail.textContent=`RAID · ${viewers.toLocaleString()} viewers · ${admitted} arriving`;},
 update(time:number,reducedMotion:boolean){const age=time-opened,fade=Math.min(1,Math.max(0,age/.55),Math.max(0,(RAID_PARADE_MS/1000-age)/1.2));root.visible=fade>0;root.scale.setScalar(reducedMotion?1:.9+fade*.1);ringMaterial.opacity=fade;uniforms.uOpen.value=fade;uniforms.uTime.value=reducedMotion?0:time;return root.visible;},dispose(){remove();}};
}

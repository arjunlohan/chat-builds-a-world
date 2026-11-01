import {BufferGeometry,CircleGeometry,DataTexture,DoubleSide,Float32BufferAttribute,Group,Mesh,MeshPhysicalMaterial,Object3D,PlaneGeometry,Points,RepeatWrapping,LinearFilter,LinearMipmapLinearFilter,RGBAFormat,ShaderMaterial,Vector2} from 'three';
import {terrainHeight,random} from './land.js';
/** A tiled, deterministic micro-normal field. No images, extra scene captures or transmission pass. */
function flowNormals(){
 const side=128,data=new Uint8Array(side*side*4),tau=Math.PI*2;
 for(let y=0;y<side;y++)for(let x=0;x<side;x++){const u=x/side*tau,v=y/side*tau,dx=(3*Math.cos(u*3)*Math.cos(v*4)*.3+7*Math.cos((u+v)*7)*.12)*.12,dy=(-4*Math.sin(u*3)*Math.sin(v*4)*.3+7*Math.cos((u+v)*7)*.12)*.12,scale=1/Math.hypot(dx,dy,1),i=(y*side+x)*4;data[i]=Math.round((-.5*dx*scale+.5)*255);data[i+1]=Math.round((-.5*dy*scale+.5)*255);data[i+2]=Math.round((.5*scale+.5)*255);data[i+3]=255;}
 const map=new DataTexture(data,side,side,RGBAFormat);map.wrapS=map.wrapT=RepeatWrapping;map.repeat.set(5,5);map.minFilter=LinearMipmapLinearFilter;map.magFilter=LinearFilter;map.anisotropy=4;map.needsUpdate=true;map.generateMipmaps=true;return map;
}
export function createRealWater(){
 const root=new Group();root.name='flowing spring and waterfall';const time={value:0},day={value:1},normal=flowNormals(),fallNormal=normal.clone();fallNormal.needsUpdate=true;fallNormal.repeat.set(1,6);
 const material=new MeshPhysicalMaterial({color:'#4a8b80',roughness:.14,metalness:.08,clearcoat:.8,clearcoatRoughness:.12,normalMap:normal,normalScale:new Vector2(.48,.48),envMapIntensity:.85,side:DoubleSide});
 material.onBeforeCompile=shader=>{shader.uniforms.uFlowTime=time;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float uFlowTime;attribute float aWaterDepth;varying float vWaterDepth;varying vec3 vFlowWorld;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWaterDepth=aWaterDepth;vFlowWorld=position;transformed.y+=sin(position.x*3.1+uFlowTime)*cos(position.z*2.7-uFlowTime*.8)*.012*aWaterDepth;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uFlowTime;varying float vWaterDepth;varying vec3 vFlowWorld;').replace('#include <color_fragment>',`#include <color_fragment>
   float shore=1.0-smoothstep(.012,.10,vWaterDepth);float ripple=.5+.5*sin(vFlowWorld.x*17.0+vFlowWorld.z*13.0-uFlowTime*2.0);
   vec3 waterColor=mix(vec3(.24,.43,.35),vec3(.025,.14,.16),clamp(vWaterDepth,0.0,1.0));
   diffuseColor.rgb=mix(waterColor,vec3(.7,.78,.7),shore*(.35+.4*ripple));`);
 };material.customProgramCacheKey=()=>"depth-flow-water-v1";
 function surface(geometry:BufferGeometry,x:number,y:number,z:number,sx:number,sy:number,angle:number,stream=false){
  const transform=new Object3D();transform.rotation.set(-Math.PI/2,0,angle);transform.position.set(x,y,z);transform.scale.set(sx,sy,1);transform.updateMatrix();geometry.applyMatrix4(transform.matrix);
  const p=geometry.getAttribute('position'),uv=geometry.getAttribute('uv'),depth=new Float32Array(p.count);for(let i=0;i<p.count;i++)depth[i]=stream ? .55*(1-Math.abs(uv.getY(i)-.5)*2):Math.max(0,Math.min(1,(y-terrainHeight(p.getX(i),p.getZ(i)))/.75));
  geometry.setAttribute('aWaterDepth',new Float32BufferAttribute(depth,1));const mesh=new Mesh(geometry,material);mesh.receiveShadow=true;root.add(mesh);return mesh;
 }
 surface(new CircleGeometry(1,96),-2.5,1.13,1.5,3.5,2.25,0);surface(new PlaneGeometry(6.4,.72,24,2),-8,1.12,2.2,1,1,-.045,true);
 const fallMaterial=new MeshPhysicalMaterial({color:'#90b8b4',roughness:.21,metalness:.04,normalMap:fallNormal,normalScale:new Vector2(.45,.8),envMapIntensity:.8,transparent:true,opacity:.76,depthWrite:false,side:DoubleSide});
 fallMaterial.onBeforeCompile=shader=>{shader.uniforms.uFlowTime=time;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vFallUv;uniform float uFlowTime;').replace('#include <begin_vertex>','#include <begin_vertex>\nvFallUv=uv;transformed.z+=sin(uv.y*11.0-uFlowTime*3.0)*.025;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vFallUv;uniform float uFlowTime;').replace('#include <color_fragment>',`#include <color_fragment>
   float edge=smoothstep(0.0,.13,vFallUv.x)*(1.0-smoothstep(.87,1.0,vFallUv.x));float streak=pow(.5+.5*sin(vFallUv.x*63.0+sin(vFallUv.y*17.0+uFlowTime*4.0)),4.0);
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.75,.86,.83),streak*.65);diffuseColor.a*=edge*(.45+streak*.45);`);
 };fallMaterial.customProgramCacheKey=()=>"flowing-fall-v1";
 const fall=new Mesh(new PlaneGeometry(.78,6,3,28),fallMaterial);fall.position.set(-11,-1.8,2.32);fall.rotation.y=-Math.PI/2;root.add(fall);
 const rng=random(580),positions=new Float32Array(64*3),phases=new Float32Array(64);
 for(let i=0;i<64;i++){positions[i*3]=-11+(rng()-.5)*.2;positions[i*3+1]=1.0+rng()*.1;positions[i*3+2]=2.32+(rng()-.5)*.55;phases[i]=rng();}
 const sprayGeometry=new BufferGeometry();sprayGeometry.setAttribute('position',new Float32BufferAttribute(positions,3));sprayGeometry.setAttribute('aPhase',new Float32BufferAttribute(phases,1));
 const sprayMaterial=new ShaderMaterial({uniforms:{uTime:time,uDay:day},transparent:true,depthWrite:false,vertexShader:`uniform float uTime;attribute float aPhase;varying float vFade;void main(){float age=fract(uTime*.35+aPhase);vec3 p=position+vec3(-age*.8,-age*age*7.5,sin(aPhase*61.0)*age*.55);vec4 view=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*view;gl_PointSize=clamp(65.0/-view.z,1.0,4.0);vFade=sin(age*3.14159)*.23;}`,fragmentShader:`uniform float uDay;varying float vFade;void main(){float d=length(gl_PointCoord-.5)*2.0;if(d>1.0)discard;gl_FragColor=vec4(mix(vec3(.3,.46,.63),vec3(.77,.88,.85),uDay),pow(1.0-d,2.0)*vFade);}`});
 const spray=new Points(sprayGeometry,sprayMaterial);spray.frustumCulled=false;spray.name='64 pooled waterfall spray droplets';root.add(spray);
 return {root,update(seconds:number,light:number){time.value=seconds;day.value=light;normal.offset.set(seconds*.018,seconds*.012);fallNormal.offset.set(0,seconds*.16);}};
}

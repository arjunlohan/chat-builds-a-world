import {Mesh,MeshNormalMaterial,type Material,type Scene,type Texture,type IUniform,type WebGLRenderer,type BufferGeometry,type WebGLRenderTarget} from 'three';
import type {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
/** Keep leaf holes in GTAO's normal/depth pass instead of occluding rectangular cards. */
export function cutoutNormals(ao:GTAOPass,scene:Scene){
 type AlphaMaterial=Material&{map?:Texture|null;alphaMap?:Texture|null;side:number};
 const cached=new Map<Material,MeshNormalMaterial>(),restore=new Map<Mesh,Material|Material[]>();
 const pass=ao as GTAOPass&{_renderOverride(renderer:WebGLRenderer,material:Material,target:WebGLRenderTarget,color:number,alpha:number):void};
 const render=pass._renderOverride.bind(ao),dispose=ao.dispose.bind(ao);
 function normal(source:Material){
  const m=source as AlphaMaterial;if(!m.alphaTest||!m.map)return source;let n=cached.get(m);if(n)return n;
  n=new MeshNormalMaterial({side:m.side});n.allowOverride=false;
  const uniforms:{map:IUniform<Texture>;cutoff:IUniform<number>}={map:{value:m.map},cutoff:{value:m.alphaTest/Math.max(.001,m.opacity)}};
  n.onBeforeCompile=shader=>{shader.uniforms.uCutoutMap=uniforms.map;shader.uniforms.uCutoutAlpha=uniforms.cutoff;
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vCutoutUv;').replace('#include <begin_vertex>','#include <begin_vertex>\nvCutoutUv=uv;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vCutoutUv;uniform sampler2D uCutoutMap;uniform float uCutoutAlpha;');
   // MeshNormalMaterial has no common fragment include in Three.js 0.187.
   if(!shader.fragmentShader.includes('uniform sampler2D uCutoutMap'))shader.fragmentShader='varying vec2 vCutoutUv;uniform sampler2D uCutoutMap;uniform float uCutoutAlpha;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('void main() {','void main() {\nif(texture2D(uCutoutMap,vCutoutUv).a<uCutoutAlpha)discard;');
  };n.customProgramCacheKey=()=>"leaf-cutout-normal-v1";cached.set(m,n);return n;
 }
 pass._renderOverride=(renderer,material,target,color,alpha)=>{
  if(material!==ao.normalMaterial){render(renderer,material,target,color,alpha);return;}
  scene.traverse(o=>{if(!(o instanceof Mesh))return;const source=o.material;if(Array.isArray(source)){if(!source.some(m=>m.alphaTest>0&&(m as AlphaMaterial).map))return;restore.set(o,source);o.material=source.map(normal);}else if(source.alphaTest>0&&(source as AlphaMaterial).map){restore.set(o,source);o.material=normal(source);}});
  try{render(renderer,material,target,color,alpha);}finally{for(const [mesh,source] of restore)mesh.material=source;restore.clear();}
 };
 ao.dispose=()=>{for(const material of cached.values())material.dispose();cached.clear();dispose();};
}

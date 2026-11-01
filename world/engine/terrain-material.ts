import {MeshStandardMaterial} from 'three';
import {assetMaps} from './asset-bank.js';
/** World-space, slope/height blending over the unchanged navigation surface. */
export function terrainMaterial(cliff=false){
 const material=new MeshStandardMaterial({color:cliff?'#555d63':'#ffffff',roughness:.94,metalness:.01,envMapIntensity:cliff?.18:.45}),maps=assetMaps('ground');if(!maps)return material;
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{tLandColor:{value:maps.color},tLandNormal:{value:maps.normal},tLandArm:{value:maps.arm}});
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vLandPosition,vLandNormal;').replace('#include <begin_vertex>','#include <begin_vertex>\nvLandPosition=(modelMatrix*vec4(position,1.0)).xyz;vLandNormal=normalize(mat3(modelMatrix)*normal);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   varying vec3 vLandPosition,vLandNormal;uniform sampler2D tLandColor,tLandNormal,tLandArm;
   vec2 atlasUV(vec2 p,vec2 tile){return tile+vec2(.00390625)+fract(p)*.4921875;}
   vec3 triplanar(sampler2D tex,vec3 p,vec3 w){vec2 tile=vec2(.5,0.0);return texture2D(tex,atlasUV(p.yz,tile)).rgb*w.x+texture2D(tex,atlasUV(p.xz,tile)).rgb*w.y+texture2D(tex,atlasUV(p.xy,tile)).rgb*w.z;}
   float landNoise(vec2 p){return sin(p.x*.72+sin(p.y*.51))*cos(p.y*.83-p.x*.22)*.5+.5;}
  `);
  const rock=`landColor+=triplanar(tLandColor,triPos,weights)*blend.w;landArm+=triplanar(tLandArm,triPos,weights)*blend.w;landDetail+=triplanar(tLandNormal,triPos,weights)*blend.w;`;
  const layer=(component:string,uv:string,tint:string)=>`if(blend.${component}>.001){landColor+=texture2D(tLandColor,${uv}).rgb*${tint}*blend.${component};landArm+=texture2D(tLandArm,${uv}).rgb*blend.${component};landDetail+=texture2D(tLandNormal,${uv}).rgb*blend.${component};}`;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
   vec3 landN=normalize(vLandNormal),weights=pow(abs(landN),vec3(4.0));weights/=max(.001,weights.x+weights.y+weights.z);
   vec2 uvLand=vLandPosition.xz*.58;vec3 triPos=vLandPosition*.7;
   float macro=landNoise(vLandPosition.xz),steep=smoothstep(.2,.7,1.0-abs(landN.y));
   float wet=1.0-smoothstep(.9,1.5,vLandPosition.y),forest=smoothstep(1.85,3.0,vLandPosition.y)*(.4+.45*macro),moss=clamp(.18+.5*landNoise(vLandPosition.zx*.7+2.0)+wet*.3,0.0,.8);
   vec4 blend=vec4((1.0-forest)*(1.0-moss),moss,forest*(1.0-moss),0.0);blend.xyz*=1.0-max(steep,wet*.8);blend.w=max(steep,wet*.8);blend/=dot(blend,vec4(1.0));
   vec3 landColor=vec3(0.0),landArm=vec3(0.0),landDetail=vec3(0.0);
   ${cliff?'blend=vec4(0.0,0.0,0.0,1.0);'+rock:
     layer('x','atlasUV(uvLand,vec2(0.0,.5))','vec3(.68,.95,.6)')+
     layer('y','atlasUV(uvLand*.83,vec2(.5,.5))','vec3(.58,.86,.5)')+
     layer('z','atlasUV(uvLand*.67,vec2(0.0,0.0))','vec3(.9,.95,.85)')+`if(blend.w>.001){${rock}}`}
   landColor*=mix(.78,1.1,macro)*mix(1.0,.63,wet);diffuseColor.rgb*=landColor;
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(landArm.g*mix(1.0,.58,wet),.22,1.0);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   landDetail=landDetail*2.0-1.0;vec3 detailWorld=normalize(landN+vec3(landDetail.x,0.0,landDetail.y)*.38);normal=normalize(mat3(viewMatrix)*detailWorld);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>','#include <aomap_fragment>\nreflectedLight.indirectDiffuse*=landArm.r;reflectedLight.indirectSpecular*=landArm.r;');
 };
 material.customProgramCacheKey=()=>`terrain-scanned-atlas-v2-${cliff}`;return material;
}

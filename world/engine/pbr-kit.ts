import {Color,MeshStandardMaterial,MeshBasicMaterial,MeshLambertMaterial,MeshPhongMaterial,Mesh,Texture,type MeshStandardMaterialParameters,type Material,type Object3D} from 'three';
import {toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';
import {MATERIAL_KIT,type MaterialPreset} from '../shared/material-kit.js';import {assetMaps} from './asset-bank.js';import type {WorldLook} from './render-profile.js';import type {ResourceOwner} from './resources.js';
export function materialPreset(parameters:MeshStandardMaterialParameters):MaterialPreset{
 const name=parameters.name?.toLowerCase()??'';if(Object.hasOwn(MATERIAL_KIT,name))return name as MaterialPreset;
 if(/glass/.test(name)||(parameters.opacity??1)<.65)return 'glass';if(/canvas|cloth/.test(name))return 'canvas';if(/paper/.test(name))return 'paper';if(/rope/.test(name))return 'rope';
 if(/wood|bark|branch|stump/.test(name))return 'wood';if(/stone|rock|concrete/.test(name))return 'stone';
 const color=new Color(parameters.color??'#ffffff'),emissive=new Color(parameters.emissive??0),metal=parameters.metalness??0;
 if(emissive.getHex()!==0&&(parameters.emissiveIntensity??1)>0)return 'glow';
 if(metal>.6){if(color.r>color.b*1.5)return color.g>color.r*.7?'gold':color.g>color.r*.4?'brass':'copper';return 'iron';}
 if(color.g>color.r*1.18&&color.g>color.b*1.15)return 'foliage';if(color.r>color.b*1.5&&color.r>color.g&&color.g>color.b*1.2&&Math.max(color.r,color.g,color.b)<.65)return 'wood';
 if((parameters.roughness??.8)>.8&&Math.max(color.r,color.g,color.b)-Math.min(color.r,color.g,color.b)<.1)return Math.max(color.r,color.g,color.b)>.75?'paper':'stone';return 'painted';
}
/** Independent texture parameters/disposal; immutable bank pixels share one GPU Source. */
export function ownedTexture(source:Texture){return source.clone();}
/** Each owner gets texture objects it can dispose; immutable decoded images remain in the bank. */
export function presetMaterial(parameters:MeshStandardMaterialParameters,preset:MaterialPreset=materialPreset(parameters),look:WorldLook='new'){
 if(look==='classic')return new MeshStandardMaterial(parameters);
 const recipe=MATERIAL_KIT[preset],opacity=Math.min(parameters.opacity??1,'opacity' in recipe?recipe.opacity:1),m=new MeshStandardMaterial({...parameters,roughness:recipe.roughness,metalness:recipe.metalness,opacity,transparent:opacity<1,forceSinglePass:true,flatShading:false});
 if('texture' in recipe){const maps=assetMaps(recipe.texture);if(maps){const color=ownedTexture(maps.color),normal=ownedTexture(maps.normal),arm=ownedTexture(maps.arm);m.map=color;m.normalMap=normal;m.aoMap=m.roughnessMap=m.metalnessMap=arm;m.normalScale.setScalar(preset==='paper'?.25:.5);}}
 m.userData.kitPreset=preset;return m;
}
export function cloneModelMaterial(source:MeshStandardMaterial,tint:string,opacity:number,emissive:string,intensity:number,cache:Map<Texture,Texture>,kind?:string){
 const m=source.clone(),preset=materialPreset({name:source.name,color:source.color,roughness:source.roughness,metalness:source.metalness,opacity:source.opacity}),recipe=MATERIAL_KIT[preset];m.roughness=recipe.roughness;m.metalness=recipe.metalness;m.flatShading=false;m.forceSinglePass=true;m.color.multiply(new Color(tint));m.opacity=Math.min(source.opacity*opacity,'opacity' in recipe?recipe.opacity:1);m.alphaTest*=m.opacity/Math.max(.001,source.opacity);m.transparent=m.opacity<1;if(m.transparent)m.depthWrite=false;m.userData.kitPreset=preset;
 if(intensity>0){m.emissive.set(emissive);m.emissiveIntensity=intensity;}
 if(kind==='lantern'){m.emissiveIntensity=0;if(preset==='glass'){m.color.set('#fff1d2').multiply(new Color(tint));m.emissive.set(intensity>0?emissive:'#ffc77e');m.emissiveMap=null;m.userData.kitLamp=Math.max(1.5,intensity);updateKitLamp(m,1);}}
 for(const key of Object.keys(m)){const object=m as unknown as Record<string,unknown>,value=object[key];if(value instanceof Texture){let copy=cache.get(value);if(!copy){copy=ownedTexture(value);cache.set(value,copy);}object[key]=copy;}}
 return m;
}
export function updateKitLamp(material:MeshStandardMaterial,day:number){if(typeof material.userData.kitLamp==='number')material.emissiveIntensity=material.userData.kitLamp*(1+(1-Math.max(0,Math.min(1,day)))*1.5);}
/** Keep captured material/geometry references working when normalizing plain runtime meshes. */
export function moduleMaterialKit(){
 const prepared=new WeakSet<Material>(),converted=new WeakMap<Material,Material>(),smooth=new WeakSet<object>();
 return (root:Object3D,owner:ResourceOwner)=>{
  let changed=false;
  const convert=(source:Material):Material=>{
   if(prepared.has(source))return source;const prior=converted.get(source);if(prior)return prior;
   if(!(source instanceof MeshStandardMaterial||source instanceof MeshBasicMaterial||source instanceof MeshLambertMaterial||source instanceof MeshPhongMaterial))return source;
   const parameters:MeshStandardMaterialParameters={name:source.name,color:source.color,opacity:source.opacity,side:source.side,vertexColors:source.vertexColors,depthWrite:source.depthWrite,depthTest:source.depthTest,...(source instanceof MeshStandardMaterial?{roughness:source.roughness,metalness:source.metalness}:{}),...('emissive' in source?{emissive:source.emissive,emissiveIntensity:source.emissiveIntensity}:{})};
   const kit=presetMaterial(parameters);let target:MeshStandardMaterial;
   if(source instanceof MeshStandardMaterial){target=source;target.roughness=kit.roughness;target.metalness=kit.metalness;target.map=kit.map;target.normalMap=kit.normalMap;target.normalScale.copy(kit.normalScale);target.aoMap=kit.aoMap;target.roughnessMap=kit.roughnessMap;target.metalnessMap=kit.metalnessMap;target.opacity=kit.opacity;target.transparent=kit.transparent;target.flatShading=false;target.forceSinglePass=true;target.userData.kitPreset=kit.userData.kitPreset;owner.materialChanged(target);kit.dispose();}
   else{target=kit;target.color=source.color;if('emissive' in source)target.emissive=source.emissive;
    for(const key of ['opacity','transparent','visible','side','wireframe','vertexColors','depthWrite','depthTest','blending'] as const){Object.defineProperty(source,key,{configurable:true,enumerable:true,get:()=>target[key],set:value=>{(target as unknown as Record<string,unknown>)[key]=value;}});}
    Object.defineProperty(source,'needsUpdate',{configurable:true,set:value=>{target.needsUpdate=value;}});converted.set(source,target);
   }
   prepared.add(target);target.needsUpdate=true;changed=true;return target;
  };
  root.traverse(object=>{if(!(object instanceof Mesh))return;const source=object.material;if(Array.isArray(source)){const next=source.map(convert);if(next.some((m,i)=>m!==source[i]))object.material=next;}else object.material=convert(source);
   if(!smooth.has(object.geometry)&&(Array.isArray(object.material)?object.material:[object.material]).some(m=>m instanceof MeshStandardMaterial)){
    const g=object.geometry;if(!g.getAttribute('normal'))g.computeVertexNormals();else if(!g.index){const normals=toCreasedNormals(g,Math.PI);if(normals!==g){g.setAttribute('normal',normals.getAttribute('normal').clone());normals.dispose();}}smooth.add(g);
   }
  });return changed;
 };
}

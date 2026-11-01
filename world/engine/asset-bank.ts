import {TextureLoader,SRGBColorSpace,RepeatWrapping,Mesh,Box3,Vector3,Group,type Texture,type MeshStandardMaterial} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import manifest from '../../assets/world/manifest.json';
import type {WorldLook} from './render-profile.js';
export interface PbrMaps {color:Texture;normal:Texture;arm:Texture}
export interface ModelAsset {root:Group;low:Group;triangles:number;draws:number}
const textures=new Map<string,PbrMaps>(),models=new Map<string,ModelAsset>();let clouds:Texture|undefined,hdr:Texture|undefined,pending:Promise<void>|undefined;
const coreModels=new Set(['rock','moss-rock','scanned-tree','fern','grass','flowers','shrub']);
const modelLoads=new Map<string,Promise<void>>(),gltf=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const url=(o:{file:string;sha256:string})=>`/world-assets/${o.file}?v=${o.sha256.slice(0,16)}`;
async function loadModel(a:typeof manifest.assets[number]){
 const [high,low]=await Promise.all(a.outputs.map(o=>gltf.loadAsync(url(o))));
 for(const scene of [high!.scene,low!.scene])scene.traverse(o=>{if(o instanceof Mesh){o.castShadow=true;o.receiveShadow=true;for(const m of (Array.isArray(o.material)?o.material:[o.material]) as MeshStandardMaterial[]){m.flatShading=false;if(m.alphaTest>0||["scanned-tree","grass","fern","shrub","flowers"].includes(a.name)&&m.transparent){m.alphaTest=m.alphaTest||.35;m.alphaToCoverage=true;m.transparent=false;m.depthWrite=true;}if(m.map)m.map.anisotropy=8;}}});
 models.set(a.name,{root:high!.scene,low:low!.scene,triangles:('triangles' in a?a.triangles:0)??0,draws:('draws' in a?a.draws:0)??0});
}
function ensureModel(a:typeof manifest.assets[number]){let load=modelLoads.get(a.name);if(!load){load=loadModel(a);modelLoads.set(a.name,load);}return load;}
/** Resolve synchronous spawnSpec dependencies before calling a module factory. */
export async function prepareModuleAssets(source:string,look:WorldLook='new'){if(look==='classic'||!source.includes('spawnSpec'))return;await Promise.all(manifest.assets.filter(a=>a.type==='model').map(ensureModel));}
export const assetMaps=(name:string)=>textures.get(name);
export const assetModel=(name:string)=>models.get(name);
export const assetSky=()=>hdr;
export const assetClouds=()=>clouds;
/** Same finite, local input set in live pages, saved-version playback and the gate. */
export function prepareWorldAssets(look:WorldLook='new'){
 if(look==='classic')return Promise.resolve();
 return pending??=load();
}
async function load(){
 const textureLoader=new TextureLoader();
 await Promise.all(manifest.assets.map(async a=>{
  if(a.type==='texture'||a.type==='atlas'){
   const maps=await Promise.all(a.outputs.map(async o=>{const map=await textureLoader.loadAsync(url(o));map.wrapS=map.wrapT=RepeatWrapping;map.anisotropy=8;if(o.file.includes('-color.'))map.colorSpace=SRGBColorSpace;return map;}));
   textures.set(a.name,{color:maps[0]!,normal:maps[1]!,arm:maps[2]!});
  }else if(a.type==='model'){
   if(coreModels.has(a.name))await ensureModel(a);
  }else if(a.type==='image'){clouds=await textureLoader.loadAsync(url(a.outputs[0]!));clouds.colorSpace=SRGBColorSpace;}else hdr=await new HDRLoader().loadAsync(url(a.outputs[0]!));
 }));
}
/** Clone the scene graph only. Engine instances may borrow immutable asset resources. */
export function fittedModel(name:string,size:Vector3,low=false){
 const asset=models.get(name);if(!asset)throw new Error(`Missing committed model: ${name}`);
 const root=(low?asset.low:asset.root).clone(true),box=new Box3().setFromObject(root),extent=box.getSize(new Vector3()),center=box.getCenter(new Vector3());
 const wrapper=new Group();wrapper.add(root);root.position.sub(center);wrapper.scale.set(size.x/Math.max(.001,extent.x),size.y/Math.max(.001,extent.y),size.z/Math.max(.001,extent.z));return wrapper;
}

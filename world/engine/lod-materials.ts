import {Mesh,type Material,type Object3D} from 'three';
/** Audited LOD pairs share named surfaces, including one decoded image/GPU source. */
export function shareLodMaterials(high:Object3D,low:Object3D){
 const named=new Map<string,Material>();high.traverse(object=>{if(object instanceof Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material]){const previous=named.get(material.name);if(previous&&previous!==material)throw new Error('Ambiguous model surface');named.set(material.name,material);}});
 const unused=new Set<Material>();low.traverse(object=>{if(!(object instanceof Mesh))return;const replace=(material:Material)=>{const shared=named.get(material.name);if(!shared)throw new Error(`Missing high LOD surface: ${material.name}`);if(material!==shared)unused.add(material);return shared;};object.material=Array.isArray(object.material)?object.material.map(replace):replace(object.material);});for(const material of unused)material.dispose();
}

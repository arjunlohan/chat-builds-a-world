import {Vector3,Mesh,BufferGeometry,Float32BufferAttribute,type MeshStandardMaterial} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {assetModel} from './asset-bank.js';
const templates=new Map<string,{geometry:BufferGeometry;materials:MeshStandardMaterial[]}>();
/** Centered unit-box geometry, finite material groups and no live references into a model scene. */
export function modelTemplate(name:string,low=false){
 const key=name+':'+low,cached=templates.get(key);if(cached)return cached;
 const asset=assetModel(name);if(!asset)throw new Error(`Model not prepared: ${name}`);const root=low?asset.low:asset.root;root.updateMatrixWorld(true);
 const parts:BufferGeometry[]=[],materials:MeshStandardMaterial[]=[];
 root.traverse(o=>{if(!(o instanceof Mesh))return;const source=o.geometry.clone().applyMatrix4(o.matrixWorld),g=source.index?source.toNonIndexed():source;
 if(g!==source)source.dispose();for(const name of Object.keys(g.attributes))if(!['position','normal','uv'].includes(name))g.deleteAttribute(name);
 if(!g.getAttribute('normal'))g.computeVertexNormals();if(!g.getAttribute('uv'))g.setAttribute('uv',new Float32BufferAttribute(new Float32Array(g.getAttribute('position').count*2),2));
 const sourceMaterials=(Array.isArray(o.material)?o.material:[o.material]) as MeshStandardMaterial[];
 if(sourceMaterials.length===1){g.clearGroups();parts.push(g);materials.push(sourceMaterials[0]!);}else{
  for(const group of g.groups){const part=new BufferGeometry();for(const name of ['position','normal','uv']){const a=g.getAttribute(name),values=new Float32Array(group.count*a.itemSize);for(let i=0;i<group.count;i++)for(let j=0;j<a.itemSize;j++)values[i*a.itemSize+j]=a.array[(group.start+i)*a.itemSize+j]!;part.setAttribute(name,new Float32BufferAttribute(values,a.itemSize));}parts.push(part);materials.push(sourceMaterials[group.materialIndex??0]!);}g.dispose();
 }
 });
 const geometry=mergeGeometries(parts,true)!;for(const part of parts)part.dispose();geometry.computeBoundingBox();const box=geometry.boundingBox!,size=box.getSize(new Vector3()),center=box.getCenter(new Vector3());geometry.translate(-center.x,-center.y,-center.z);geometry.scale(1/Math.max(.001,size.x),1/Math.max(.001,size.y),1/Math.max(.001,size.z));geometry.computeBoundingSphere();
 const result={geometry,materials};templates.set(key,result);return result;
}

import {Vector3,Mesh,BufferGeometry,Float32BufferAttribute,type MeshStandardMaterial,type Group} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {assetModel} from './asset-bank.js';
const templates=new Map<string,{geometry:BufferGeometry;materials:MeshStandardMaterial[]}>();
/** Decode quantized/interleaved attributes before applying transforms or splitting material groups. */
export function modelTemplate(name:string,low=false){
 const key=name+':'+low,cached=templates.get(key);if(cached)return cached;
 const asset=assetModel(name);if(!asset)throw new Error(`Model not prepared: ${name}`);const root=low?asset.low:asset.root;const result=flattenModel(root);templates.set(key,result);return result;
}
export function flattenModel(root:Group){
 root.updateMatrixWorld(true);
 const parts:BufferGeometry[]=[],materials:MeshStandardMaterial[]=[];
 root.traverse(o=>{if(!(o instanceof Mesh))return;const source=o.geometry,sourceMaterials=(Array.isArray(o.material)?o.material:[o.material]) as MeshStandardMaterial[];
  const groups=sourceMaterials.length>1?source.groups:[{start:0,count:source.index?.count??source.getAttribute('position').count,materialIndex:0}];
  for(const group of groups){
   const part=new BufferGeometry();for(const name of ['position','normal','uv']){
    const a=source.getAttribute(name),itemSize=name==='uv'?2:3,values=new Float32Array(group.count*itemSize);
    if(a)for(let i=0;i<group.count;i++){const j=source.index?.getX(group.start+i)??group.start+i;values[i*itemSize]=a.getX(j);values[i*itemSize+1]=a.getY(j);if(itemSize===3)values[i*itemSize+2]=a.getZ(j);}
    part.setAttribute(name,new Float32BufferAttribute(values,itemSize));
   }
   if(!source.getAttribute('normal'))part.computeVertexNormals();part.applyMatrix4(o.matrixWorld);parts.push(part);materials.push(sourceMaterials[group.materialIndex??0]!);
  }
 });
 const geometry=mergeGeometries(parts,true)!;for(const part of parts)part.dispose();geometry.computeBoundingBox();const box=geometry.boundingBox!,size=box.getSize(new Vector3()),center=box.getCenter(new Vector3());geometry.translate(-center.x,-center.y,-center.z);geometry.scale(1/Math.max(.001,size.x),1/Math.max(.001,size.y),1/Math.max(.001,size.z));geometry.computeBoundingSphere();
 return {geometry,materials};
}

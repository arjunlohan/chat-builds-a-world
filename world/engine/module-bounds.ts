import {Box3,type Object3D,type Mesh,type InstancedMesh} from "three";
/** Visible owned geometry only. Hidden pooled objects acquire bounds when shown. */
export function moduleBounds(roots:readonly Object3D[]){
 const bounds=new Box3(),box=new Box3();
 for(const root of roots){root.updateWorldMatrix(true,true);root.traverseVisible(node=>{
  const mesh=node as Mesh;if(!mesh.geometry)return;
  const instanced=mesh as InstancedMesh;
  if(instanced.isInstancedMesh){instanced.computeBoundingBox();if(instanced.boundingBox)bounds.union(box.copy(instanced.boundingBox).applyMatrix4(node.matrixWorld));}
  else{if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();if(mesh.geometry.boundingBox)bounds.union(box.copy(mesh.geometry.boundingBox).applyMatrix4(node.matrixWorld));}
 });}return bounds;
}

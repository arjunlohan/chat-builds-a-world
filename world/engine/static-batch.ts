import { Color, Float32BufferAttribute, Matrix4, Mesh, MeshStandardMaterial, type BufferGeometry, type Group, type InstancedMesh } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
/** Bake the immutable garden once. Identical triangles, normals, colors and shadow policy; fewer draw/instance transforms. */
export function batchStaticGarden(root: Group) {
  root.updateMatrixWorld(true);
  const batches=new Map<string,{material:MeshStandardMaterial;cast:boolean;receive:boolean;pieces:BufferGeometry[]}>(),originals=new Set<BufferGeometry>(),materials=new Set<MeshStandardMaterial>();
  const world=new Matrix4(),instance=new Matrix4(),tint=new Color();
  root.traverse(object=>{
    if(!(object instanceof Mesh)||!(object.material instanceof MeshStandardMaterial))return;
    const source=object.material,key=`${source.uuid}:${object.castShadow}:${object.receiveShadow}`;
    let batch=batches.get(key);if(!batch){const material=source.clone();material.vertexColors=true;batch={material,cast:object.castShadow,receive:object.receiveShadow,pieces:[]};batches.set(key,batch);}
    originals.add(object.geometry);materials.add(source);
    const instanced=object as InstancedMesh,count=instanced.isInstancedMesh?instanced.count:1;
    for(let i=0;i<count;i++){
      world.copy(object.matrixWorld);tint.setRGB(1,1,1);
      if(instanced.isInstancedMesh){instanced.getMatrixAt(i,instance);world.multiply(instance);if(instanced.instanceColor)instanced.getColorAt(i,tint);}
      const geometry=object.geometry.clone();geometry.deleteAttribute("uv");geometry.applyMatrix4(world);
      const vertices=geometry.getAttribute("position").count,old=geometry.getAttribute("color"),colors=new Float32Array(vertices*3);
      for(let j=0;j<vertices;j++){colors[j*3]=tint.r*(old?.getX(j)??1);colors[j*3+1]=tint.g*(old?.getY(j)??1);colors[j*3+2]=tint.b*(old?.getZ(j)??1);}
      geometry.setAttribute("color",new Float32BufferAttribute(colors,3));batch.pieces.push(geometry);
    }
  });
  root.clear();for(const batch of batches.values()){
    const geometry=mergeGeometries(batch.pieces);if(!geometry)throw new Error("Static garden batch failed");
    for(const piece of batch.pieces)piece.dispose();const mesh=new Mesh(geometry,batch.material);mesh.name="immutable garden batch";mesh.castShadow=batch.cast;mesh.receiveShadow=batch.receive;root.add(mesh);
  }
  for(const geometry of originals)geometry.dispose();for(const material of materials)material.dispose();return root;
}

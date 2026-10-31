import { BufferAttribute, BufferGeometry, Color, Matrix3, Matrix4, Mesh, MeshStandardMaterial, Vector3, type Group, type InstancedMesh } from "three";
/** Transform directly into one allocation per material/shadow batch; no per-instance geometry copies. */
export function batchStaticGarden(root: Group) {
  root.updateMatrixWorld(true);
  const batches=new Map<string,{material:MeshStandardMaterial;cast:boolean;receive:boolean;objects:Mesh[];vertices:number;indices:number}>(),originals=new Set<BufferGeometry>(),materials=new Set<MeshStandardMaterial>();
  root.traverse(object=>{
    if(!(object instanceof Mesh)||!(object.material instanceof MeshStandardMaterial))return;
    const source=object.material,key=`${source.uuid}:${object.castShadow}:${object.receiveShadow}`;
    let batch=batches.get(key);if(!batch){const material=source.clone();material.vertexColors=true;batch={material,cast:object.castShadow,receive:object.receiveShadow,objects:[],vertices:0,indices:0};batches.set(key,batch);}
    const count=(object as InstancedMesh).isInstancedMesh?(object as InstancedMesh).count:1,vertices=object.geometry.getAttribute("position").count;
    batch.objects.push(object);batch.vertices+=vertices*count;batch.indices+=(object.geometry.index?.count??vertices)*count;
    originals.add(object.geometry);materials.add(source);
  });
  const world=new Matrix4(),instance=new Matrix4(),normalMatrix=new Matrix3(),point=new Vector3(),normal=new Vector3(),tint=new Color();
  root.clear();
  for(const batch of batches.values()){
    const positions=new Float32Array(batch.vertices*3),normals=new Float32Array(batch.vertices*3),colors=new Float32Array(batch.vertices*3),indices=new (batch.vertices>65535?Uint32Array:Uint16Array)(batch.indices);
    let vertexOffset=0,indexOffset=0;
    for(const object of batch.objects){
      const source=object.geometry,p=source.getAttribute("position"),n=source.getAttribute("normal"),c=source.getAttribute("color"),instanced=object as InstancedMesh,count=instanced.isInstancedMesh?instanced.count:1;
      for(let i=0;i<count;i++){
        world.copy(object.matrixWorld);tint.setRGB(1,1,1);
        if(instanced.isInstancedMesh){instanced.getMatrixAt(i,instance);world.multiply(instance);if(instanced.instanceColor)instanced.getColorAt(i,tint);}
        normalMatrix.getNormalMatrix(world);
        for(let j=0;j<p.count;j++){
          const offset=(vertexOffset+j)*3;
          point.fromBufferAttribute(p,j).applyMatrix4(world);point.toArray(positions,offset);
          normal.fromBufferAttribute(n,j).applyNormalMatrix(normalMatrix);normal.toArray(normals,offset);
          colors[offset]=tint.r*(c?.getX(j)??1);colors[offset+1]=tint.g*(c?.getY(j)??1);colors[offset+2]=tint.b*(c?.getZ(j)??1);
        }
        for(let j=0;j<(source.index?.count??p.count);j++)indices[indexOffset++]=vertexOffset+(source.index?.getX(j)??j);
        vertexOffset+=p.count;
      }
    }
    const geometry=new BufferGeometry();geometry.setAttribute("position",new BufferAttribute(positions,3));geometry.setAttribute("normal",new BufferAttribute(normals,3));geometry.setAttribute("color",new BufferAttribute(colors,3));geometry.setIndex(new BufferAttribute(indices,1));
    const mesh=new Mesh(geometry,batch.material);mesh.name="immutable garden batch";mesh.castShadow=batch.cast;mesh.receiveShadow=batch.receive;root.add(mesh);
  }
  for(const geometry of originals)geometry.dispose();for(const material of materials)material.dispose();return root;
}

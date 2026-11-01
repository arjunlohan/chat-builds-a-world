import test from 'node:test';import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3,Mesh} from 'three';import {CameraDirector} from '../world/engine/camera-director.js';
import {createTerrain} from '../world/engine/terrain.js';import {HOME_POSES} from '../world/engine/camera-director.js';
test('new home framing fills about two thirds of 1080p width while classic keeps its original pose',()=>{
 const camera=new PerspectiveCamera(38,16/9,.1,300);new CameraDirector(camera,true,'new');camera.updateMatrixWorld(true);const root=createTerrain('new');let min=Infinity,max=-Infinity;const point=new Vector3();root.updateMatrixWorld(true);root.traverse(o=>{if(!(o instanceof Mesh))return;const p=o.geometry.getAttribute('position');for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld).project(camera);min=Math.min(min,point.x);max=Math.max(max,point.x);}});assert.ok((max-min)/2>.6&&(max-min)/2<.7,String((max-min)/2));
 const old=new PerspectiveCamera(38,16/9,.1,300);new CameraDirector(old,true,'classic');const f=HOME_POSES.classic;assert.ok(old.position.distanceTo(new Vector3(Math.sin(f.angle)*34,15.5,Math.cos(f.angle)*34))<1e-9);
 root.traverse(o=>{if(o instanceof Mesh){o.geometry.dispose();for(const material of Array.isArray(o.material)?o.material:[o.material])material.dispose();}});
});

test('scan templates decode quantized positions and normalized UVs before splitting material groups',async()=>{
 const {flattenModel}=await import('../world/engine/model-template.js');const {Group,BufferGeometry,Int16BufferAttribute,Uint16BufferAttribute,Int8BufferAttribute,MeshStandardMaterial,Box3}=await import('three');
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Int16BufferAttribute([0,0,0,30000,0,0,0,30000,0,30000,30000,0],3,true));geometry.setAttribute('uv',new Uint16BufferAttribute([0,0,65535,0,0,65535,65535,65535],2,true));geometry.setAttribute('normal',new Int8BufferAttribute([0,0,127,0,0,127,0,0,127,0,0,127],3,true));geometry.setIndex([0,1,2,1,3,2]);geometry.addGroup(0,3,0);geometry.addGroup(3,3,1);
 const a=new MeshStandardMaterial(),b=new MeshStandardMaterial(),mesh=new Mesh(geometry,[a,b]),root=new Group();mesh.position.set(2.12,3.22,1.52);mesh.scale.set(.003,.007,.009);root.add(mesh);const flat=flattenModel(root),p=flat.geometry.getAttribute('position'),uv=flat.geometry.getAttribute('uv');
 assert.equal(flat.geometry.groups.length,2);assert.equal(flat.materials[1],b);assert.ok(Math.abs(new Box3().setFromBufferAttribute(p as import('three').BufferAttribute).getSize(new Vector3()).x-1)<1e-5);assert.ok(Math.abs(uv.getX(1)-1)<1e-9);assert.equal(uv.getY(2),1);assert.equal(geometry.getAttribute('position').array[3],30000);flat.geometry.dispose();geometry.dispose();a.dispose();b.dispose();
});

test('upgraded citizen silhouette fits one bounded 300-triangle instanced creature with eye/limb regions',async()=>{
 const {creatureGeometry}=await import('../world/engine/creature-geometry.js');const geometry=creatureGeometry('new');geometry.computeBoundingBox();const size=geometry.boundingBox!.getSize(new Vector3());assert.equal(geometry.index!.count/3,300);assert.ok(Math.abs(size.x-.48)<.001);assert.ok(size.y<=.761&&size.y>.74);const parts=geometry.getAttribute('aPart');assert.deepEqual([...new Set(Array.from(parts.array))].sort((a,b)=>a-b),[0,1,2,3,4,5,6,7,8]);assert.ok(Array.from(geometry.getAttribute('normal').array).every(Number.isFinite));geometry.dispose();
});

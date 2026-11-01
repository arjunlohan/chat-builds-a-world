import {Group,InstancedMesh,Object3D,Vector3,Color,type CatmullRomCurve3,type MeshStandardMaterial,type PerspectiveCamera} from 'three';
import {GARDEN_TREE,TALLEST_TREE_HEIGHT} from '../shared/scale.js';
import {modelTemplate} from './model-template.js';
import {random,terrainHeight} from './land.js';
export interface GardenTree {x:number;z:number;size:number;tint:string}
/** Fixed near/far pools reserve their full capacity, including currently hidden LOD slots. */
export function scannedVegetation(trees:readonly GardenTree[],path:CatmullRomCurve3){
 const root=new Group(),wind={value:0},dummy=new Object3D(),tint=new Color(),rng=random(864),zero=new Object3D();zero.scale.setScalar(0);zero.updateMatrix();
 const materials=new Map<MeshStandardMaterial,MeshStandardMaterial>();
 function pool(name:string,count:number,low:boolean,casts=true){
  const template=modelTemplate(name,low),mats=template.materials.map(source=>{
   let material=materials.get(source);if(material)return material;material=source.clone();material.roughness=Math.max(.78,material.roughness);material.envMapIntensity=.55;material.alphaToCoverage=material.alphaTest>0;material.transparent=false;
   const leaf=material.alphaTest>0;if(leaf)material.side=2;
   material.onBeforeCompile=shader=>{shader.uniforms.uVegetationTime=wind;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float uVegetationTime;').replace('#include <begin_vertex>',`#include <begin_vertex>\nfloat weight=smoothstep(-.4,.5,position.y);transformed.x+=sin(uVegetationTime*.8+instanceMatrix[3].x*.7+instanceMatrix[3].z)*weight*${name==='scanned-tree'?'.014':'.045'};`);};
   material.customProgramCacheKey=()=>`scan-wind-${name}`;materials.set(source,material);return material;
  });
  const geometry=name==='grass'?template.geometry.clone():template.geometry;
  if(name==='grass'){const normal=geometry.getAttribute('normal');for(let i=0;i<normal.count;i++)normal.setXYZ(i,0,1,0);}
  const mesh=new InstancedMesh(geometry,mats,count);mesh.name=`scanned ${name} ${low?'far':'near'} pool`;mesh.castShadow=casts;mesh.receiveShadow=true;mesh.frustumCulled=false;root.add(mesh);for(let i=0;i<count;i++)mesh.setMatrixAt(i,zero.matrix);return mesh;
 }
 function place(mesh:InstancedMesh,i:number,p:Vector3,size:Vector3,angle:number,color='#ffffff'){
  dummy.position.copy(p);dummy.rotation.set(0,angle,0);dummy.scale.copy(size);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,tint.set(color));
 }
 const treeNear=pool('scanned-tree',2,false),treeFar=pool('scanned-tree',trees.length,true);
 const grassNear=pool('grass',12,false,false),grassFar=pool('grass',320,true,false);
 const pathPoints=path.getPoints(80),spots:{p:Vector3;size:Vector3;angle:number}[]=[];
 const clear=(x:number,z:number)=>pathPoints.every(p=>(p.x-x)**2+(p.z-z)**2>.5**2)&&trees.every(t=>(t.x-x)**2+(t.z-z)**2>.4**2);
 for(let attempt=0;attempt<4000&&spots.length<320;attempt++){
  const x=(rng()-.5)*18,z=(rng()-.5)*14,y=terrainHeight(x,z);if((x/9.6)**2+(z/7.6)**2>.88||y<1.43||!clear(x,z))continue;
  const s=.8+rng()*.5;spots.push({p:new Vector3(x,y+.16*s,z),size:new Vector3(.85*s,.32*s,.85*s),angle:rng()*Math.PI*2});
 }
 for(const [name,count,width,height] of [['fern',8,.7,.55],['shrub',4,.95,.8],['flowers',8,.5,.45]] as const){
  const mesh=pool(name,count,true,false);for(let i=0;i<count;i++){const s=spots[(i*7+count)%spots.length]!;place(mesh,i,new Vector3(s.p.x,terrainHeight(s.p.x,s.p.z)+height*.5,s.p.z),new Vector3(width,height,width),s.angle);}
  mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor!.needsUpdate=true;
 }
 const position=new Vector3(),size=new Vector3();let nextLod=-Infinity;
 function update(time:number,camera:PerspectiveCamera){
  wind.value=time;if(time<nextLod)return;nextLod=time+1;
  const nearest=trees.map((t,i)=>({i,d:(t.x-camera.position.x)**2+(t.z-camera.position.z)**2})).sort((a,b)=>a.d-b.d).slice(0,2).filter(t=>t.d<32**2).map(t=>t.i);
  for(let i=0;i<trees.length;i++){
   const t=trees[i]!,height=t.size*TALLEST_TREE_HEIGHT/GARDEN_TREE.largestSize;position.set(t.x,terrainHeight(t.x,t.z)+height*.5,t.z);size.set(t.size*2,height,t.size*1.8);
   const slot=nearest.indexOf(i);if(slot>=0){place(treeNear,slot,position,size,i*1.7);treeFar.setMatrixAt(i,zero.matrix);}else place(treeFar,i,position,size,i*1.7);
  }
  for(let i=nearest.length;i<2;i++)treeNear.setMatrixAt(i,zero.matrix);
  const nearGrass=spots.map((s,i)=>({i,d:s.p.distanceToSquared(camera.position)})).sort((a,b)=>a.d-b.d).slice(0,12).map(s=>s.i);
  for(let i=0;i<320;i++){const s=spots[i];if(!s){grassFar.setMatrixAt(i,zero.matrix);continue;}const slot=nearGrass.indexOf(i);if(slot>=0){place(grassNear,slot,s.p,s.size,s.angle);grassFar.setMatrixAt(i,zero.matrix);}else place(grassFar,i,s.p,s.size,s.angle);}
  for(let i=nearGrass.length;i<12;i++)grassNear.setMatrixAt(i,zero.matrix);
  for(const mesh of [treeNear,treeFar,grassNear,grassFar]){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
 }
 return {root,update};
}

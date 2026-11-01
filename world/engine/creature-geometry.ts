import {BufferGeometry,Float32BufferAttribute,Matrix4,Color,SphereGeometry,IcosahedronGeometry,ConeGeometry} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {surfaceNormals} from './materials.js';import {indexGeometry} from './index-geometry.js';import type {WorldLook} from './render-profile.js';
/** Preserve the creature silhouette in one 300-triangle geometry, shared by all 300 slots. */
export function creatureGeometry(look:WorldLook){
 const pieces:BufferGeometry[]=[];
 function piece(geometry:BufferGeometry,tint:boolean,color:string,x:number,y:number,z:number,sx:number,sy:number,sz:number,part:number,body=false){
  const smooth=surfaceNormals(geometry,look),g=smooth.index?smooth.toNonIndexed():smooth.clone();if(smooth!==geometry)smooth.dispose();geometry.dispose();g.applyMatrix4(new Matrix4().makeScale(sx,sy,sz));g.translate(x,y,z);
  const count=g.getAttribute('position').count,c=new Color(color),colors=new Float32Array(count*3);for(let i=0;i<count;i++){colors[i*3]=c.r;colors[i*3+1]=c.g;colors[i*3+2]=c.b;}
  g.setAttribute('color',new Float32BufferAttribute(colors,3));g.setAttribute('aTint',new Float32BufferAttribute(new Float32Array(count).fill(Number(tint)),1));g.setAttribute('aBody',new Float32BufferAttribute(new Float32Array(count).fill(Number(body)),1));g.setAttribute('aPart',new Float32BufferAttribute(new Float32Array(count).fill(part),1));pieces.push(g);
 }
 const classic=look==='classic';piece(classic?new IcosahedronGeometry(1,1):new SphereGeometry(1,16,6),true,'#ffffff',0,.31,0,.24,.3,.21,0,true);
 piece(classic?new IcosahedronGeometry(1,1):new SphereGeometry(1,8,3),false,'#f4e6c5',0,.34,.16,.175,.145,.075,1);
 piece(classic?new IcosahedronGeometry(1,0):new SphereGeometry(1,6,2),true,'#ffffff',0,.22,-.23,.09,.09,.09,2);
 for(const [i,side] of [-1,1].entries()){
  piece(new ConeGeometry(1,1,classic?5:6),true,'#ffffff',side*.125,.64,0,.08,.24,.065,3+i);
  piece(classic?new IcosahedronGeometry(1,0):new SphereGeometry(1,6,2),false,'#283b42',side*.065,.385,.225,.024,.032,.018,5+i);
  piece(classic?new IcosahedronGeometry(1,0):new SphereGeometry(1,6,3),false,'#eee1bf',side*.12,.055,.06,.095,.055,.12,7+i);
 }
 const combined=mergeGeometries(pieces)!;for(const g of pieces)g.dispose();if(classic){const normals=combined.getAttribute('normal');for(let i=0;i<normals.count;i++)normals.setXYZ(i,0,1,0);}
 return indexGeometry(combined);
}

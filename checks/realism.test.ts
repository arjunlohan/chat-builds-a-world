import test from 'node:test';import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3,Mesh} from 'three';import {CameraDirector} from '../world/engine/camera-director.js';
import {createTerrain} from '../world/engine/terrain.js';import {HOME_POSES} from '../world/engine/camera-director.js';
test('new home framing fills about two thirds of 1080p width while classic keeps its original pose',()=>{
 const camera=new PerspectiveCamera(38,16/9,.1,300);new CameraDirector(camera,true,'new');camera.updateMatrixWorld(true);const root=createTerrain('new');let min=Infinity,max=-Infinity;const point=new Vector3();root.updateMatrixWorld(true);root.traverse(o=>{if(!(o instanceof Mesh))return;const p=o.geometry.getAttribute('position');for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld).project(camera);min=Math.min(min,point.x);max=Math.max(max,point.x);}});assert.ok((max-min)/2>.6&&(max-min)/2<.7,String((max-min)/2));
 const old=new PerspectiveCamera(38,16/9,.1,300);new CameraDirector(old,true,'classic');const f=HOME_POSES.classic;assert.ok(old.position.distanceTo(new Vector3(Math.sin(f.angle)*34,15.5,Math.cos(f.angle)*34))<1e-9);
 root.traverse(o=>{if(o instanceof Mesh){o.geometry.dispose();for(const material of Array.isArray(o.material)?o.material:[o.material])material.dispose();}});
});

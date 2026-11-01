import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorldPipeline} from '../server/pipeline.js';
import {Versions} from '../server/versions/index.js';
import {captureStore} from '../server/capture.js';
import {captureQuery} from '../world/engine/capture.js';
test('a named take pins saved version, roster and clocks across fresh requests and restart',async()=>{
 const root=await mkdtemp(join(tmpdir(),'capture-pins-'));let now=1700000000000;const pipeline=new WorldPipeline(()=>now),versions=new Versions(root,()=>{});
 try{await versions.activate({version:1,tag:'v1',commit:'fixture',title:'Saved world',requester:'Viewer',modules:[]},false);
 const chat=(id:string)=>pipeline.chat({id,userId:id,displayName:id,text:'hello',color:'#abcdef'});chat('one');const capture=captureStore(pipeline,versions),first=await capture('v1','take');now+=1000;chat('two');assert.deepEqual(await capture('v1','take'),first);assert.equal((await capture('v1','other')).citizens.length,2);
 assert.deepEqual(await captureStore(new WorldPipeline(),versions)('v1','take'),first);assert.equal(first.version?.tag,'v1');await assert.rejects(capture('../v1','take'));await assert.rejects(capture('v9','take'));await assert.rejects(capture('v1','../escape'));
 }finally{versions.close();await rm(root,{recursive:true,force:true});}
});
test('capture query bounds the seed and camera paths',()=>{assert.equal(captureQuery(new URLSearchParams('seed=7&path=push-in')).path,'push-in');assert.equal(captureQuery(new URLSearchParams('path=unknown')).path,'fixed');assert.throws(()=>captureQuery(new URLSearchParams('seed=NaN')));});

test('capture camera paths stay finite and push in on the owned module bounds',async()=>{
 const {capturePath}=await import('../world/engine/capture-path.js'),{PerspectiveCamera,Box3,Vector3}=await import('three');const camera=new PerspectiveCamera(38,16/9,.1,300),bounds=new Box3(new Vector3(-3,3,-2),new Vector3(0,5,1));
 for(const path of ['fixed','orbit','push-in','flyover'] as const){capturePath(camera,path,4,bounds);assert.ok(camera.position.toArray().every(Number.isFinite));assert.ok(camera.matrixWorld.elements.every(Number.isFinite));}
 capturePath(camera,'push-in',0,bounds);const start=camera.position.distanceTo(bounds.getCenter(new Vector3()));capturePath(camera,'push-in',12,bounds);assert.ok(camera.position.distanceTo(bounds.getCenter(new Vector3()))<start);
});

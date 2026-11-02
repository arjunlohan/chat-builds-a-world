import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Group} from 'three';import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {inspectModule} from '../server/runner/policy.js';import {Versions} from '../server/versions/index.js';
import {prepareNamedModels,assetModel} from '../world/engine/asset-bank.js';
test('source model metadata includes a computed kind annotation erased by bundling and survives restart',async()=>{
 const source=(await readFile('checks/fixtures/modules/computed-kind.ts','utf8')).replace('../../../world/engine/api.js','../engine/api.js');
 const metadata=inspectModule(source,'world/modules/computed.ts');assert.deepEqual(metadata.modelKinds,['lantern']);assert.deepEqual(inspectModule('export default()=>({init(s){s.log("info","lantern");}});','world/modules/text.ts').modelKinds,[]);
 const root=await mkdtemp(join(tmpdir(),'model-manifest-'));
 try{const versions=new Versions(root,()=>{}),module=await versions.artifact('computed','world/modules/computed.ts','export default()=>({});',metadata.modelKinds);await versions.activate({version:1,tag:'v1',commit:'fixture',title:'Computed',requester:'viewer',modules:[module]},false);const restored=new Versions(root,()=>{});await restored.init();assert.deepEqual(restored.current!.modules[0]!.modelKinds,['lantern']);assert.deepEqual(restored.modelsFor(module.hash),['lantern']);versions.close();restored.close();}finally{await rm(root,{recursive:true,force:true});}
});
test('a failed model fetch is evicted and a later use retries successfully',async()=>{
 const original=GLTFLoader.prototype.loadAsync;let calls=0;
 GLTFLoader.prototype.loadAsync=async()=>{calls++;if(calls<=2)throw new Error('fixture fetch failed');return {scene:new Group()} as GLTF;};
 try{await assert.rejects(()=>prepareNamedModels(['bench']),/fixture fetch/);assert.equal(assetModel('bench'),undefined);await prepareNamedModels(['bench']);assert.equal(calls,4);assert.ok(assetModel('bench'));await prepareNamedModels(['bench']);assert.equal(calls,4);}finally{GLTFLoader.prototype.loadAsync=original;}
});

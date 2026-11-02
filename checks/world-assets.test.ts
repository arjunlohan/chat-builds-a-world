import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import manifest from '../assets/world/manifest.json';
test('committed CC0 inputs are finite data, checksummed and below the asset budget',async()=>{
 let bytes=0;const allowed=new Set<string>();for(const asset of manifest.assets){assert.equal(asset.license,'CC0-1.0');assert.match(asset.source,/^https:\/\/(polyhaven\.com\/a\/|ambientcg\.com\/a\/)/);for(const output of asset.outputs){assert.match(output.file,/^[a-z0-9-]+\.(webp|glb|hdr)$/);allowed.add(output.file);const data=await readFile('assets/world/'+output.file);assert.equal(data.length,output.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),output.sha256);bytes+=data.length;
 if(output.file.endsWith('.glb')){assert.equal(data.toString('utf8',0,4),'glTF');const size=data.readUInt32LE(12),json=JSON.parse(data.toString('utf8',20,20+size));assert.ok(json.extensionsRequired.includes('EXT_meshopt_compression'));assert.ok(json.extensionsUsed.includes('EXT_texture_webp'));assert.ok((json.buffers??[]).every((b:{uri?:string})=>!b.uri));assert.ok((json.images??[]).every((i:{uri?:string;mimeType?:string})=>!i.uri&&i.mimeType==='image/webp'));assert.ok(!json.animations?.length);if(output.file.endsWith('-lod.glb')){assert.equal(json.images?.length??0,0);assert.equal(json.textures?.length??0,0);const high=await readFile('assets/world/'+output.file.replace('-lod.glb','.glb')),highJson=JSON.parse(high.toString('utf8',20,20+high.readUInt32LE(12)));assert.deepEqual(json.materials.map((m:{name:string})=>m.name),highJson.materials.map((m:{name:string})=>m.name));}}
 }}assert.ok(bytes<manifest.budgetBytes);assert.ok(manifest.bytes<manifest.budgetBytes);assert.deepEqual((await readdir('assets/world')).sort(),[...allowed,'manifest.json'].sort());assert.equal(manifest.assets.filter(a=>a.type==='model').length,20);
});

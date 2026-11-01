/** Generated admission data is checked against the audited asset manifest, not hand-copied into prompts. */
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {models} from './asset-catalog.mjs';
const fallback={lantern:'cylinder',bench:'box',crate:'box',barrel:'cylinder','bridge-planks':'box',plinth:'cylinder',campfire:'cone',bucket:'cylinder',pot:'cylinder',flowers:'mushroom',fern:'plane',grass:'plane','scanned-tree':'tree',rock:'crystal','moss-rock':'crystal',shrub:'sphere',log:'cylinder',ladder:'box',chair:'box',table:'box'};
export async function writeModelKit(assets,check=false){
 const data=Object.fromEntries(models.map(([name])=>{const asset=assets.find(a=>a.type==='model'&&a.name===name);if(!asset)throw new Error(`Missing kit model: ${name}`);return[name,{triangles:asset.triangles,lowTriangles:asset.lowTriangles,draws:asset.draws,lowDraws:asset.lowDraws??asset.draws,fallback:fallback[name]}];}));
 const text=JSON.stringify(data,null,2)+'\n',file='world/shared/model-kit.json';if(check){if(await readFile(file,'utf8')!==text)throw new Error('Model kit drifted from audited asset metadata; run node scripts/model-kit.mjs.');}else await writeFile(file,text);
}
export function renderedUsage(doc){let triangles=0,draws=0;doc.getRoot().getDefaultScene()?.traverse(node=>{const mesh=node.getMesh();if(mesh)for(const p of mesh.listPrimitives()){triangles+=(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3;draws++;}});return {triangles,draws};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const file='assets/world/manifest.json',manifest=JSON.parse(await readFile(file,'utf8'));
 if(process.argv.includes('--refresh-metrics')){const {NodeIO}=await import('@gltf-transform/core'),{ALL_EXTENSIONS}=await import('@gltf-transform/extensions'),{MeshoptDecoder}=await import('meshoptimizer');await MeshoptDecoder.ready;const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
  for(const asset of manifest.assets.filter(a=>a.type==='model')){const high=renderedUsage(await io.read('assets/world/'+asset.outputs[0].file)),low=renderedUsage(await io.read('assets/world/'+asset.outputs[1].file));Object.assign(asset,{triangles:high.triangles,draws:high.draws,lowTriangles:low.triangles,lowDraws:low.draws});}await writeFile(file,JSON.stringify(manifest,null,2)+'\n');
 }
 await writeModelKit(manifest.assets,process.argv.includes('--check'));
}

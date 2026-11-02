/** Real summon pipeline; only the test entrypoint exposes renderer allocation counts. */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createWorldServer} from '../server/http.js';
import {WorldPipeline} from '../server/pipeline.js';
import {SummonService} from '../server/summon/index.js';
import {zeroUsage} from '../server/summon/provider.js';
import {Versions} from '../server/versions/index.js';
import {launchWorldPage} from './browser.js';
import fixture from '../server/summon/fixtures/crystals.json';
declare global {interface Window {__textureStats?:()=>{textures:number;summons:number;modelPixelBytes:number;uploads:number}}}
let offset=0,calls=0;
const now=()=>Date.now()+offset,pipeline=new WorldPipeline(now);
const summon=new SummonService({config:{model:'fixture',effort:'low',tier:'fixture'},mode:'fixture',now,record:()=>{},reply:()=>{},publish:event=>pipeline.publish(event),provider:{async generate(){
 const spec=structuredClone(fixture);
 spec.geometries=[{...spec.geometries[0]!,kind:'box',size:[1.2,1.2,1.2]}];
 spec.materials=[{...spec.materials[0]!,preset:'brick',emissive:'#000000',emissiveIntensity:0} as typeof spec.materials[number]];
 spec.nodes=[{...spec.nodes[0]!,position:[-4+(calls++%2)*3,4,-2]}];spec.behaviors=[];spec.lights=[];spec.emitters=[];
 return{json:JSON.stringify(spec),usage:zeroUsage()};
}}});
pipeline.attachSummon(summon);pipeline.chat({id:'warm',userId:'warm',displayName:'Warm',color:'#e5bb8b',text:'Hello'});
const client=(await build({stdin:{contents:`
import{prepareWorldAssets,prepareNamedModels,assetModel}from'./world/engine/asset-bank.js';
import{MODEL_KIT}from'./world/shared/model-kit.js';import{Texture,Mesh}from'three';
import{createRenderer}from'./world/engine/renderer.js';import{pageProfile}from'./world/engine/render-profile.js';
let uploads=0;const upload=WebGL2RenderingContext.prototype.texSubImage2D;WebGL2RenderingContext.prototype.texSubImage2D=function(...args){uploads++;return Reflect.apply(upload,this,args);};
await prepareWorldAssets();await prepareNamedModels(Object.keys(MODEL_KIT));
const sources=new Set();let modelPixelBytes=0;for(const name of Object.keys(MODEL_KIT))for(const root of [assetModel(name).root,assetModel(name).low])root.traverse(object=>{if(object instanceof Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])for(const value of Object.values(material))if(value instanceof Texture&&!sources.has(value.source)){sources.add(value.source);modelPixelBytes+=value.image.width*value.image.height*4;}});
document.body.classList.add('overlay-active');
const world=createRenderer(document.querySelector('canvas'),{labels:document.querySelector('#citizen-labels'),profile:pageProfile(new URLSearchParams(location.search),'new'),fixedTime:.25,onReady(){document.querySelector('#status').hidden=true;document.querySelector('canvas').dataset.ready='true';}});
window.__textureStats=()=>({textures:world.renderer.info.memory.textures,summons:world.materializer.count,modelPixelBytes,uploads});
`,loader:'ts',resolveDir:process.cwd()},bundle:true,format:'esm',write:false,plugins:[{name:'three',setup(b){b.onResolve({filter:/^three$/},()=>({path:'/assets/three.js',external:true}));}}]})).outputFiles[0]!.text;
const root=await mkdtemp(join(tmpdir(),'texture-sharing-')),versions=new Versions(root,version=>pipeline.publish({type:'version',version}));
const app=await createWorldServer(pipeline,summon,undefined,versions);await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;let world:Awaited<ReturnType<typeof launchWorldPage>>|undefined;
try{
 world=await launchWorldPage(base,'overlay=1',{onPage:page=>{void page.route('**/assets/world.js',route=>route.fulfill({contentType:'text/javascript',body:client}));}});
 const page=world.page;await page.waitForFunction(()=>!!window.__textureStats);await page.waitForTimeout(2000);
 const counts=[await page.evaluate(()=>window.__textureStats!())],statuses=[];
 for(let cycle=0;cycle<2;cycle++){
  for(let i=0;i<2;i++){
   const id=cycle*2+i;assert.equal(pipeline.chat({id:'summon-'+id,userId:'viewer-'+id,displayName:'Viewer'+id,color:'#e5bb8b',text:'!summon a brick cube'}).accepted,true);
   await page.waitForFunction(count=>window.__textureStats!().summons===count,i+1);await page.waitForTimeout(2000);counts.push(await page.evaluate(()=>window.__textureStats!()));offset+=5100;
  }
  const rendered=summon.active().map(scene=>summon.status(scene.id)?.status);assert.deepEqual(rendered,['rendered','rendered']);statuses.push(rendered);
  assert.equal(counts.at(-1)!.uploads,counts.at(-2)!.uploads,'Identical second summon must not re-upload unchanged texture pixels');
  assert.equal(counts.at(-1)!.textures,counts.at(-2)!.textures,'Second summon must reuse the same GPU texture sources');
  const peak=counts.at(-1)!.textures;
  for(let remaining=1;remaining>=0;remaining--){await summon.clearLatest();await page.waitForFunction(count=>window.__textureStats!().summons===count,remaining);await page.waitForTimeout(250);counts.push(await page.evaluate(()=>window.__textureStats!()));}
  assert.equal(counts.at(-2)!.textures,peak,'Disposing one owner must retain the other owner texture');
  assert.ok(counts.at(-1)!.textures<peak,'Disposing both owners releases their uploads');
 }
 assert.equal(counts[8]!.textures,counts[4]!.textures,'Repeated summon/clear cycles must not grow the steady texture count');
 assert.deepEqual(world.errors,[]);await mkdir('state/visual',{recursive:true});const report={counts,statuses,errors:world.errors};await writeFile('state/visual/p26-texture-sharing.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await world?.browser.close();versions.close();app.closeStreams();app.server.closeAllConnections();await new Promise<void>(r=>app.server.close(()=>r()));await rm(root,{recursive:true,force:true});}

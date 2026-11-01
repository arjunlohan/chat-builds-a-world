/** Data-only offline pipeline. Powered by Poly Haven (https://polyhaven.com). */
import {mkdir,readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {join,resolve,dirname,extname} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {DataUtils} from 'three';
import {unzipSync} from 'fflate';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune,weld,simplify,meshopt,textureCompress} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder,MeshoptSimplifier} from 'meshoptimizer';
import {textures,ambient,models,sky,budgetBytes} from './asset-catalog.mjs';
const out=resolve('assets/world'),cache=resolve('state/asset-cache'),records=[];
await mkdir(out,{recursive:true});await mkdir(cache,{recursive:true});await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const md5=b=>createHash('md5').update(b).digest('hex'),sha=b=>createHash('sha256').update(b).digest('hex');
async function download(url,file,hash){
 const u=new URL(url);if(u.protocol!=='https:'||!['api.polyhaven.com','dl.polyhaven.org','ambientcg.com'].includes(u.hostname))throw new Error('Unapproved asset origin');
 let bytes;try{bytes=await readFile(file);if(hash&&md5(bytes)!==hash)bytes=undefined;}catch{}
 if(!bytes){const r=await fetch(url,{headers:{'User-Agent':'ChatBuildsAWorld/1.0 (offline CC0 assets)'},signal:AbortSignal.timeout(90000)});if(!r.ok)throw new Error(`${r.status}: ${url}`);bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>80_000_000)throw new Error('Input asset exceeds 80 MB');if(hash&&md5(bytes)!==hash)throw new Error('Source checksum mismatch');await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);}
 return bytes;
}
async function files(id){return JSON.parse(await download(`https://api.polyhaven.com/files/${id}`,join(cache,id+'.json')));}
async function save(file,bytes){await writeFile(join(out,file),bytes);return {file,bytes:bytes.length,sha256:sha(bytes)};}
async function texture(name,id){
 const f=await files(id),outputs=[];for(const [slot,key] of [['color','Diffuse'],['normal','nor_gl'],['arm','arm']]){
  const info=f[key]?.['1k']?.jpg;if(!info)throw new Error(`Missing ${id} ${key}`);const raw=await download(info.url,join(cache,`${id}-${slot}.jpg`),info.md5);
  outputs.push({...await save(`${name}-${slot}.webp`,await sharp(raw).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).webp({quality:slot==='color'?88:95,effort:5}).toBuffer()),source:info.url});
 }records.push({name,type:'texture',id,source:`https://polyhaven.com/a/${id}`,license:'CC0-1.0',outputs});console.log('texture',name);
}
async function ambientTexture(name,id){
 const url=`https://ambientcg.com/get?file=${id}_1K-JPG.zip`,zip=unzipSync(await download(url,join(cache,id+'.zip'))),outputs=[];
 const find=pattern=>Object.entries(zip).find(([file])=>pattern.test(file))?.[1];const color=find(/_Color\.jpg$/i),normal=find(/_NormalGL\.jpg$/i),rough=find(/_Roughness\.jpg$/i),ao=find(/_AmbientOcclusion\.jpg$/i);
 if(!color||!normal||!rough)throw new Error('Missing ambientCG data maps');
 const r=await sharp(rough).resize(1024,1024).greyscale().raw().toBuffer(),a=ao?await sharp(ao).resize(1024,1024).greyscale().raw().toBuffer():Buffer.alloc(1024*1024,255),arm=Buffer.alloc(1024*1024*3);
 for(let i=0;i<r.length;i++){arm[i*3]=a[i];arm[i*3+1]=r[i];arm[i*3+2]=0;}
 for(const [slot,raw] of [['color',color],['normal',normal]])outputs.push(await save(`${name}-${slot}.webp`,await sharp(raw).resize(1024,1024).webp({quality:slot==='normal'?95:88}).toBuffer()));
 outputs.push(await save(`${name}-arm.webp`,await sharp(arm,{raw:{width:1024,height:1024,channels:3}}).webp({quality:95}).toBuffer()));
 records.push({name,type:'texture',id,source:`https://ambientcg.com/a/${id}`,download:url,license:'CC0-1.0',outputs});console.log('ambient',name);
}
function triangles(doc){let n=0;for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives())n+=(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3;return n;}
async function model(name,id,target){
 const f=await files(id),info=f.gltf?.['1k']?.gltf;if(!info)throw new Error(`No glTF: ${id}`);const directory=join(cache,id);await download(info.url,join(directory,'scene.gltf'),info.md5);
 for(const [file,inc] of Object.entries(info.include??{})){if(!/\.(bin|png|jpg|jpeg)$/i.test(file)||file.includes('..')||file.startsWith('/'))throw new Error('Unsafe data dependency');await download(inc.url,join(directory,file),inc.md5);}
 const json=JSON.parse(await readFile(join(directory,'scene.gltf'),'utf8'));for(const data of [...(json.buffers??[]),...(json.images??[])])if(data.uri&&!Object.hasOwn(info.include??{},data.uri))throw new Error('Unlisted model data URI');
 const doc=await io.read(join(directory,'scene.gltf'));
 const selection={grass:/_small_a_/,fern:/fern_02_a$/,flowers:/./,'moss-rock':/_rock01$/,'bridge-planks':/_planks$/}[name];
 if(selection){for(const scene of doc.getRoot().listScenes()){const keep=scene.listChildren().find(n=>selection.test(n.getName()));if(!keep)throw new Error('Curated model variant missing');for(const node of scene.listChildren())if(node!==keep)scene.removeChild(node);}}
 for(const animation of doc.getRoot().listAnimations())animation.dispose();
 await doc.transform(dedup(),prune(),weld());const original=triangles(doc);await doc.transform(simplify({simplifier:MeshoptSimplifier,ratio:Math.min(1,target/original),error:.015}),textureCompress({encoder:sharp,targetFormat:'webp',resize:[1024,1024],quality:90,effort:60}),meshopt({encoder:MeshoptEncoder,level:'high'}));
 const high=await save(`${name}.glb`,await io.writeBinary(doc)),count=triangles(doc),draws=doc.getRoot().listMeshes().reduce((n,m)=>n+m.listPrimitives().length,0);
 await doc.transform(simplify({simplifier:MeshoptSimplifier,ratio:.32,error:.06}),meshopt({encoder:MeshoptEncoder,level:'high'}));const low=await save(`${name}-lod.glb`,await io.writeBinary(doc));
 records.push({name,type:'model',id,download:info.url,sourceMd5:info.md5,source:`https://polyhaven.com/a/${id}`,license:'CC0-1.0',triangles:count,lowTriangles:triangles(doc),draws,outputs:[high,low]});console.log('model',name,count,'triangles',high.bytes,'bytes');
}
if(process.argv.includes('--clouds-only'))records.push(...JSON.parse(await readFile(join(out,'manifest.json'),'utf8')).assets.filter(a=>a.name!=='clouds'));else{
for(const row of textures)await texture(...row);for(const row of ambient)await ambientTexture(...row);for(const row of models)await model(...row);
const atlasOutputs=[];for(const slot of ['color','normal','arm']){const tiles=[];for(const [i,name] of ['grass','moss','forest','basalt'].entries()){const tile=await sharp(join(out,`${name}-${slot}.webp`)).resize(1008,1008).extend({top:8,bottom:8,left:8,right:8,extendWith:'repeat'}).png().toBuffer();tiles.push({input:tile,left:(i%2)*1024,top:Math.floor(i/2)*1024});}atlasOutputs.push(await save(`ground-${slot}.webp`,await sharp({create:{width:2048,height:2048,channels:3,background:'#808080'}}).composite(tiles).webp({quality:slot==='color'?88:95,effort:5}).toBuffer()));}
records.push({name:'ground',type:'atlas',id:'dark_rock',source:'https://polyhaven.com/a/dark_rock',derivedFrom:['grass_ground','mossy_rock','forest_floor','dark_rock'],license:'CC0-1.0',outputs:atlasOutputs});
const f=await files(sky),info=f.hdri?.['2k']?.hdr;if(!info)throw new Error('Missing 2K HDR');const hdr=await save('sky.hdr',await download(info.url,join(cache,'sky-2k.hdr'),info.md5));records.push({name:'sky',type:'hdri',id:sky,source:`https://polyhaven.com/a/${sky}`,license:'CC0-1.0',outputs:[{...hdr,source:info.url}]});
}
const cloudsId='cloud_layers',cloudFiles=await files(cloudsId),cloudInfo=cloudFiles.hdri['2k'].hdr,cloudRaw=await download(cloudInfo.url,join(cache,'cloud-layers.hdr'),cloudInfo.md5);
const cloudData=new HDRLoader().parse(cloudRaw.buffer.slice(cloudRaw.byteOffset,cloudRaw.byteOffset+cloudRaw.byteLength)),cw=1024,ch=512,rgba=Buffer.alloc(cw*ch*4);
for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){
 const sx=x,sy=Math.floor(y*(cloudData.height*.31)/ch),i=(sy*cloudData.width+sx)*4,r=DataUtils.fromHalfFloat(cloudData.data[i]),g=DataUtils.fromHalfFloat(cloudData.data[i+1]),b=DataUtils.fromHalfFloat(cloudData.data[i+2]),high=Math.max(r,g,b,.001);
 const saturation=(high-Math.min(r,g,b))/high,lum=(r+g+b)/3,white=Math.max(0,Math.min(1,(.57-saturation)/.35))*Math.max(0,Math.min(1,(lum-.03)/.2)),edge=Math.min(1,x/60,(cw-1-x)/60,y/35,(ch-1-y)/35),alpha=white*edge*edge;
 const shade=Math.max(.35,Math.min(1,Math.pow((r+g+b)/3,.35)*.85));const v=Math.round(shade*255),j=(y*cw+x)*4;rgba[j]=rgba[j+1]=rgba[j+2]=v;rgba[j+3]=Math.round(alpha*255);
}
records.push({name:'clouds',type:'image',id:cloudsId,source:`https://polyhaven.com/a/${cloudsId}`,download:cloudInfo.url,sourceMd5:cloudInfo.md5,license:'CC0-1.0',outputs:[await save('clouds.webp',await sharp(rgba,{raw:{width:cw,height:ch,channels:4}}).webp({quality:92,alphaQuality:100}).toBuffer())]});
async function total(dir){let n=0;for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory()){if(!['renders','__pycache__'].includes(e.name))n+=await total(p);}else n+=(await stat(p)).size;}return n;}
const bytes=await total('assets');if(bytes>budgetBytes)throw new Error(`Asset budget exceeded: ${bytes}`);
await writeFile(join(out,'manifest.json'),JSON.stringify({format:1,budgetBytes,bytes,assets:records},null,2)+'\n');
const rows=records.map(a=>`| ${a.name} | ${a.type} | [${a.id}](${a.source}) | CC0-1.0 | ${a.outputs.reduce((n,o)=>n+o.bytes,0).toLocaleString('en-US')} | ${a.outputs.map(o=>'['+o.file+'](assets/world/'+o.file+')').join(', ')} |`).join('\n');
await writeFile('ASSETS.md',`# World asset provenance\n\nPowered by [Poly Haven](https://polyhaven.com). Prepared with \`pnpm assets:fetch\`; runtime pages fetch only committed same-origin data. [Poly Haven license](https://polyhaven.com/license), [ambientCG license](https://docs.ambientcg.com/license/): CC0 1.0.\n\nAll source models are simplified, meshopt-compressed glTF with 1K WebP textures and a second LOD. Materials use 1K WebP color, OpenGL normals and packed AO/roughness/metalness. The terrain packs four sets into a padded 2K atlas. The sky is 2K HDR; photographic cloud cutouts are derived as 1K alpha WebP. Only data files survive the offline conversion. Raw sources and ZIPs stay in ignored state/. Collection assets select one named variant before simplification. No source scripts, Blender files or executable extensions are copied.\n\nCompressed world outputs: ${records.reduce((n,a)=>n+a.outputs.reduce((n,o)=>n+o.bytes,0),0).toLocaleString('en-US')} bytes. All committed asset sources and media: ${bytes.toLocaleString('en-US')} bytes; limit ${budgetBytes.toLocaleString('en-US')}. Manifest records exact download URLs, checksums and per-file sizes in [manifest.json](assets/world/manifest.json).\n\n| Name | Type | Source | License | Bytes | Outputs |\n| --- | --- | --- | --- | ---: | --- |\n${rows}\n\nKit names refer to these sources, not exact replicas of missing props: bridge-planks uses a modular pier, plinth a wooden stool, campfire a stone fire pit, log a stump. No trademarked props or third-party emote likenesses are included.\n`);console.log(JSON.stringify({bytes,worldAssets:records.length}));

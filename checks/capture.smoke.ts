import {captureBrowser,captureEncoder} from "./capture-browser.js";
import {Reactions} from "../server/reactions/index.js";
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createWorldServer} from '../server/http.js';
import {WorldPipeline} from '../server/pipeline.js';
import {Versions} from '../server/versions/index.js';
import {Rounds} from '../server/rounds/index.js';
const root=await mkdtemp(join(tmpdir(),'capture-browser-')),epoch=1700000000000,pipeline=new WorldPipeline(()=>epoch),versions=new Versions(root,v=>pipeline.publish({type:'version',version:v})),rounds=new Rounds({now:()=>epoch,publish:s=>pipeline.publish({type:'rounds',state:s})});pipeline.attachRounds(rounds);
if(process.env.CAPTURE_REACTION!=='0'){const reactions=new Reactions(state=>pipeline.publish({type:'reactions',state}),()=>false,()=>epoch);pipeline.attachReactions(reactions);for(let i=0;i<20;i++)pipeline.chat({id:`react-${i}`,userId:`react-${i}`,displayName:`React${i}`,color:'#58d9bd',text:'LUL'});}
for(let i=0;i<10;i++)pipeline.chat({id:`player-${i}`,userId:`player-${i}`,displayName:`Player${i}`,color:'#58d9bd',text:'Hello'});
const source=(await readFile(process.env.CAPTURE_KIT==='1'?'checks/fixtures/modules/orchard.ts':'checks/fixtures/modules/good.ts','utf8')).replace('FIXTURE_ID','capture-fixture').replace('mesh.position.set(-3, 5, 0)','mesh.position.set(-3+Math.random(), 5, 0)');
const code=(await build({stdin:{contents:source,loader:'ts',resolveDir:process.cwd()},bundle:true,format:'esm',write:false,plugins:[{name:'three',setup(b){b.onResolve({filter:/^three$/},()=>({path:'/assets/three.js',external:true}));}}]})).outputFiles[0]!.text;
await versions.activate({version:1,tag:'v1',commit:'fixture',title:'Capture module',requester:'Viewer',modules:[await versions.artifact('capture-fixture','world/modules/capture-fixture.ts',code)]},false);
const app=await createWorldServer(pipeline,undefined,rounds,versions);await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`,out=resolve('state/visual');await mkdir(out,{recursive:true});
const browser=await captureBrowser(),results:unknown[]=[],errors:string[]=[];
try{for(const route of (process.argv[2]?[process.argv[2]]:['world','capture'])){const hashes=[];for(const take of ['a','b']){
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:2}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});await page.goto(`${base}/${route}?capture=1&resolution=4k&version=v1&take=hash&seed=42&path=orbit&overlay=1`);await page.waitForFunction(()=>!!window.__capture,{timeout:60000});await page.evaluate(()=>window.__capture!.ready);
 const timing=await page.evaluate(async()=>{const start=performance.now();for(let i=0;i<24;i++)await window.__capture!.step(1/60);return {elapsedMs:performance.now()-start,frame:window.__capture!.frame,time:window.__capture!.time};});assert.equal(timing.frame,24);assert.ok(Math.abs(timing.time-.4)<1e-9);
 const file=out+`/capture-${route}-${take}.png`,pngStart=performance.now(),png=await (await captureEncoder(page))(),pngMs=performance.now()-pngStart;await writeFile(file,png);assert.equal(png.readUInt32BE(16),3840);assert.equal(png.readUInt32BE(20),2160);hashes.push(createHash('sha256').update(png).digest('hex'));results.push({route,take,...timing,frameMs:timing.elapsedMs/24,pngMs,hash:hashes.at(-1)});await context.close();
 }await writeFile(out+'/capture-results.json',JSON.stringify({results,errors},null,2));assert.equal(hashes[0],hashes[1],`${route}: fresh-page frame hashes differ`);}
 assert.deepEqual(errors,[]);await writeFile(out+'/capture-results.json',JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors}));
}finally{await browser.close();versions.close();rounds.dispose();app.closeStreams();app.server.closeAllConnections();await new Promise<void>(r=>app.server.close(()=>r()));await rm(root,{recursive:true,force:true});}

/** Reproducible native-4K beauty frames, separate from live performance measurements. */
import {captureBrowser,captureEncoder} from './capture-browser.js';
import {createWorldServer} from '../server/http.js';import {WorldPipeline} from '../server/pipeline.js';import {Versions} from '../server/versions/index.js';
import {incomingRaid,raidFixture} from '../server/twitch/raid.js';
import {build} from 'esbuild';import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import assert from 'node:assert/strict';
const steps=process.argv.includes('--settled')?720:360;const stage=process.argv[2]??'realism',epoch=1700000000000,out=resolve('state/visual');await mkdir(out,{recursive:true});
const directory=await mkdtemp(join(tmpdir(),'realism-stills-')),pipeline=new WorldPipeline(()=>epoch),versions=new Versions(directory,v=>pipeline.publish({type:'version',version:v}));
const source=(await readFile(process.argv.includes('--kit')?'checks/fixtures/modules/orchard.ts':'checks/fixtures/modules/good.ts','utf8')).replace('FIXTURE_ID','capture-fixture');
const code=(await build({stdin:{contents:source,loader:'ts',resolveDir:process.cwd()},bundle:true,format:'esm',write:false,plugins:[{name:'three',setup(b){b.onResolve({filter:/^three$/},()=>({path:'/assets/three.js',external:true}));}}]})).outputFiles[0]!.text;
await versions.activate({version:1,tag:'v1',commit:'fixture',title:process.argv.includes('--kit')?'Lantern orchard':'Amber floating stone',requester:'Comet04',modules:[await versions.artifact('capture-fixture','world/modules/capture-fixture.ts',code)]},false);
pipeline.raid(incomingRaid(raidFixture('local',150,'AuroraCrew','capture-raid'),'local')!);
const app=await createWorldServer(pipeline,undefined,undefined,versions);await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`,browser=await captureBrowser(),results=[],errors:string[]=[];
try{for(const time of ['day','golden'])for(const path of ['orbit','push-in','flyover']){
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:2});page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
 await page.goto(`${base}/world?capture=1&resolution=4k&version=v1&take=${stage}&seed=42&path=${path}&time=${time}&overlay=1`);await page.waitForFunction(()=>!!window.__capture);await page.evaluate(()=>window.__capture!.ready);
 const timing=await page.evaluate(async steps=>{const start=performance.now();for(let i=0;i<steps;i++)await window.__capture!.step(.05);return {elapsedMs:performance.now()-start,stats:window.__worldStats};},steps);
 assert.equal(timing.stats.citizenCount,150);assert.equal(timing.stats.moduleError,'');const file=`${out}/${stage}-${time}-${path}-4k.png`;await writeFile(file,await(await captureEncoder(page))());results.push({time,path,file,frameMs:timing.elapsedMs/steps});await page.close();
 }assert.deepEqual(errors,[]);await writeFile(`${out}/${stage}-stills.json`,JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors}));
}finally{await browser.close();versions.close();app.closeStreams();app.server.closeAllConnections();await new Promise<void>(r=>app.server.close(()=>r()));await rm(directory,{recursive:true,force:true});}

/** Hardware scene acceptance, credential-free and separate from the software candidate gate. */
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createWorldServer} from '../server/http.js';
import {WorldPipeline} from '../server/pipeline.js';
import {Versions} from '../server/versions/index.js';
import {launchWorldPage,measureFps} from './browser.js';
import {incomingRaid,raidFixture} from '../server/twitch/raid.js';
const stage=process.argv[2]??'realism',out=resolve('state/visual');await mkdir(out,{recursive:true});
const directory=await mkdtemp(join(tmpdir(),'realism-')),pipeline=new WorldPipeline(),versions=new Versions(directory,v=>pipeline.publish({type:'version',version:v}));
const app=await createWorldServer(pipeline,undefined,undefined,versions);await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
let world:Awaited<ReturnType<typeof launchWorldPage>>|undefined;
try{
 const start=performance.now();world=await launchWorldPage(base,'overlay=1&time=day&benchmark=1');const coldMs=performance.now()-start;assert.ok(coldMs<8000,`Cold page took ${coldMs.toFixed(0)}ms`);
 await world.page.emulateMedia({reducedMotion:'reduce'});await world.page.reload();await world.page.waitForSelector('canvas[data-ready="true"]');
 const raid=incomingRaid(raidFixture('local',150,'AuroraCrew','visual-raid'),'local')!;pipeline.raid(raid);await world.page.waitForTimeout(16000);
 const results=[];for(const phase of ['day','dusk','night']){await world.page.goto(base+`/world?overlay=1&time=${phase}&benchmark=1`);await world.page.waitForSelector('canvas[data-ready="true"]');await world.page.waitForTimeout(2000);
 await world.page.screenshot({path:out+`/${stage}-${phase}.png`});if(phase==='day'){for(const [name,x,y] of [['edge',1160,400],['citizens',680,480]] as const)await world.page.screenshot({path:out+`/${stage}-${name}-crop.png`,clip:{x,y,width:400,height:360}});}
 const timing=await measureFps(world.page,5000),render=await world.page.evaluate(()=>window.__worldBenchmark!(30));results.push({phase,...timing,gpuMs:render.frameMs,gpuP95Ms:render.p95Ms,cpuSubmitMs:render.cpuSubmitMs});}
 assert.equal(results[0]!.stats.citizenCount,150);assert.ok(results.every(r=>r.fps>=58),JSON.stringify(results));assert.deepEqual(world.errors,[]);const report={stage,coldMs,gpu:world.gpu,results,errors:world.errors};await writeFile(out+`/${stage}-metrics.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await world?.browser.close();versions.close();app.closeStreams();app.server.closeAllConnections();await new Promise<void>(r=>app.server.close(()=>r()));await rm(directory,{recursive:true,force:true});}

/** Standalone, credential-free visual comparison. Images remain under ignored state/. */
import {fixtureServer} from './fixture-server.js';
import {launchWorldPage,measureFps} from './browser.js';
import {raidFixture} from '../server/twitch/raid.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const stage=process.argv[2]??'before',ref=process.argv[3]??'HEAD',out=resolve('state/visual');await mkdir(out,{recursive:true});
const fixture=await fixtureServer(process.cwd(),{ref,prefix:`visual-${stage}-`});let world:Awaited<ReturnType<typeof launchWorldPage>>|undefined;
try{await fixture.start();world=await launchWorldPage(fixture.base,'overlay=1&time=day');const {page}=world;
await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.waitForSelector('canvas[data-ready="true"]');
const raid=await fetch(fixture.base+'/sim/eventsub',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(raidFixture('sim-broadcaster',150,'AuroraCrew','visual-raid'))});if(!raid.ok)throw new Error('Raid failed');await page.waitForTimeout(16000);
const measurements=[];
for(const time of ['day','dusk','night']){await page.goto(fixture.base+`/world?overlay=1&time=${time}`);await page.waitForSelector('canvas[data-ready="true"]');await page.waitForTimeout(2500);await page.screenshot({path:out+`/${stage}-${time}.png`});
if(time==='day'){await page.screenshot({path:out+`/${stage}-edge-crop.png`,clip:{x:1160,y:400,width:400,height:360}});await page.screenshot({path:out+`/${stage}-citizens-crop.png`,clip:{x:680,y:480,width:400,height:360}});}
const measured=await measureFps(page,5000);measurements.push({time,fps:measured.fps,avgFps:measured.avgFps,stats:measured.stats});}
if(world.errors.length)throw new Error(world.errors.join('\n'));await writeFile(out+`/${stage}-metrics.json`,JSON.stringify({ref,seed:'terrain default / garden72 / visual-raid',camera:'reduced motion fixed home',viewport:[1920,1080],measurements,errors:world.errors},null,2));console.log(JSON.stringify({stage,ref,measurements}));
}finally{await world?.browser.close();await fixture.dispose();}

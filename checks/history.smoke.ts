import assert from "node:assert/strict";
import {chromium} from "@playwright/test";
import {createWorldServer} from "../server/http.js";
import {WorldPipeline} from "../server/pipeline.js";
import {Versions} from "../server/versions/index.js";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {AddressInfo} from "node:net";
const root=await mkdtemp(join(tmpdir(),"history-credits-smoke-")),versions=new Versions(root,()=>{}),app=await createWorldServer(new WorldPipeline(),undefined,undefined,versions);
await new Promise<void>(r=>app.server.listen(0,"127.0.0.1",r));const base=`http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
const browser=await chromium.launch({headless:true,args:process.platform==="darwin"?["--use-angle=metal","--enable-gpu"]:[]}),errors:string[]=[];
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on("pageerror",e=>errors.push(e.message));page.on("console",e=>{if(e.type()==="error")errors.push(e.text());});await page.goto(base+"/history");await page.getByRole("heading",{name:"No versions yet",exact:true}).waitFor();assert.ok(await page.locator('#history-credits').isHidden());
 // Empty module sets isolate the playback/credits UI without changing production rendering.
 for(const version of [1,2])await versions.activate({version,tag:`v${version}`,commit:`fixture${version}`,title:`Lantern chapter ${version}`,requester:"Comet04",modules:[]},false);
 await page.reload();await page.waitForFunction(()=>window.__worldStats.moduleVersion===1);assert.ok(await page.locator('#history-credits').isHidden());await page.selectOption('#speed','4');
 await page.waitForFunction(()=>window.__worldStats.moduleVersion===2);assert.ok(await page.locator('#history-credits').isHidden());await page.locator('#history-credits').waitFor({state:'visible'});assert.equal(await page.locator('#playback-status').textContent(),'Credits');
 assert.deepEqual(await page.locator('.credits-version').allTextContents(),['v1','v2']);assert.equal(await page.locator('.credits-closing').textContent(),'Built live by 1 viewer · coded by Codex');
 assert.equal(await page.locator('.credits-roll').evaluate(el=>el.getAnimations().length),1);
 // Finish the real animation, check the closing line fits inside its clipping window.
 await page.locator('.credits-roll').evaluate(el=>el.getAnimations()[0]!.finish());
 const bounds=await page.locator('.credits-closing').evaluate(el=>{const a=el.getBoundingClientRect(),b=el.parentElement!.parentElement!.getBoundingClientRect();return {top:a.top,bottom:a.bottom,min:b.top,max:b.bottom};});assert.ok(bounds.top>=bounds.min&&bounds.bottom<=bounds.max,JSON.stringify(bounds));
 const gap=await page.evaluate(()=>document.querySelector("#player")!.getBoundingClientRect().top-document.querySelector("#history-credits")!.getBoundingClientRect().bottom);assert.ok(gap>=16,`Credits overlap playback controls: ${gap}`);
 await page.click('#replay');assert.ok(await page.locator('#history-credits').isHidden());
 await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.waitForFunction(()=>window.__worldStats.moduleVersion===1);assert.equal(await page.locator('#play').textContent(),'Play');await page.selectOption('#speed','4');await page.click('#play');await page.locator('#history-credits').waitFor({state:'visible'});assert.equal(await page.locator('.credits-roll').evaluate(el=>el.getAnimations().length),0);assert.equal(await page.locator('.credits-window').evaluate(el=>getComputedStyle(el).overflowY),'auto');
 assert.deepEqual(errors,[]);console.log('PASS: history empty state, credits after last chapter, content, final line framing, replay and reduced motion; zero browser errors.');
}finally{await browser.close();versions.close();app.closeStreams();app.server.closeAllConnections();await new Promise<void>(r=>app.server.close(()=>r()));await rm(root,{recursive:true,force:true});}

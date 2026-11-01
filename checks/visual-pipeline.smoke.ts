import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Versions} from "../server/versions/index.js";
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createWorldServer} from '../server/http.js';
import {WorldPipeline} from '../server/pipeline.js';
const directory=await mkdtemp(join(tmpdir(),"look-smoke-")),pipeline=new WorldPipeline(),versions=new Versions(directory,()=>{});
const app=await createWorldServer(pipeline,undefined,undefined,versions,{worldLook:'classic',live:false,async fault(){}});await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,args:process.platform==='darwin'?['--use-angle=metal','--enable-gpu']:[]}),errors:string[]=[],results=[];
try{const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});for(const [query,look,aa] of [['','classic','none'],['look=new','new','msaa-4'],['look=new&aa=smaa','new','smaa']]){
 await page.goto(`http://127.0.0.1:${(app.server.address() as {port:number}).port}/world?overlay=1&time=day&${query}`);await page.waitForSelector('canvas[data-ready="true"]');await page.waitForTimeout(200);const value=await page.locator('canvas').evaluate((canvas:HTMLCanvasElement)=>({look:canvas.dataset.look,aa:canvas.dataset.aa,width:canvas.width,height:canvas.height}));assert.equal(value.look,look);assert.equal(value.aa,aa);assert.equal(value.width,1920);assert.equal(value.height,1080);results.push(value);
 }assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors}));
}finally{await browser.close();versions.close();app.closeStreams();app.server.closeAllConnections();await new Promise<void>(r=>app.server.close(()=>r()));await rm(directory,{recursive:true,force:true});}

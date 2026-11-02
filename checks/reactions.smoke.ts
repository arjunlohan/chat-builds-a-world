/** Decode the committed media in Chromium and exercise real overlay playback, no Blender/ffmpeg needed. */
import assert from "node:assert/strict";
import {chromium} from "@playwright/test";
import {createWorldServer} from "../server/http.js";
import {WorldPipeline} from "../server/pipeline.js";
import {Reactions} from "../server/reactions/index.js";
import {CLIPS} from "../server/reactions/catalog.js";
import {mkdir,writeFile,stat} from "node:fs/promises";
import type {AddressInfo} from "node:net";
let time=Date.now();const pipeline=new WorldPipeline(()=>time),reactions=new Reactions(s=>pipeline.publish({type:"reactions",state:s}),()=>false,()=>time,()=>.5);pipeline.attachReactions(reactions);
const app=await createWorldServer(pipeline,undefined,undefined,undefined,{simulationAllowed:true,live:false,async fault(){}});await new Promise<void>(r=>app.server.listen(0,"127.0.0.1",r));const base=`http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
const browser=await chromium.launch({headless:true});const errors:string[]=[];
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on("pageerror",e=>errors.push(e.message));page.on("console",e=>{if(e.type()==="error")errors.push(e.text());});await page.goto(base+"/overlay");await page.waitForFunction(()=>document.querySelector(".connection")?.textContent==="CONNECTED");
 assert.ok(await page.locator('.twitch-notice').isHidden());pipeline.setTwitchStatus('disconnected');await page.locator('.twitch-notice').waitFor({state:'visible'});assert.equal(await page.locator('.twitch-notice').textContent(),'Twitch chat disconnected: check the server log');await page.reload();await page.locator('.twitch-notice').waitFor({state:'visible'});pipeline.setTwitchStatus('connected');await page.locator('.twitch-notice').waitFor({state:'hidden'});pipeline.setTwitchStatus('disabled');assert.ok(await page.locator('.twitch-notice').isHidden());
 const requested=process.argv[2];if(requested&&!CLIPS.some(c=>c.id===requested))throw new Error("Unknown clip");
 const results=[];
 for(const c of CLIPS.filter(c=>!requested||c.id===requested)){
  const decoded=await page.evaluate(async c=>{
   const video=document.createElement("video");video.muted=true;video.preload="auto";video.src=c.url;document.body.append(video);
   await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`Media load timed out: ${c.id}`)),10000);video.addEventListener("loadeddata",()=>{clearTimeout(timer);resolve();},{once:true});video.addEventListener("error",()=>{clearTimeout(timer);reject(new Error(`Cannot decode ${c.id}`));},{once:true});});
   video.pause();const canvas=document.createElement("canvas");canvas.width=video.videoWidth;canvas.height=video.videoHeight;const ctx=canvas.getContext("2d",{willReadFrequently:true})!,coverage:number[]=[];
   for(const at of [0,video.duration/2,Math.max(0,video.duration-.005)]){
    if(at)await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`Media seek timed out: ${c.id}`)),10000);video.addEventListener("seeked",()=>{clearTimeout(timer);resolve();},{once:true});video.currentTime=at;});
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(video,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let visible=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])visible++;coverage.push(100*visible/(canvas.width*canvas.height));
   }
   const result={id:c.id,width:video.videoWidth,height:video.videoHeight,duration:video.duration,first:coverage[0],middle:coverage[1],last:coverage[2]};video.removeAttribute("src");video.load();video.remove();return result;
  },c);
  assert.equal(decoded.first,0,`${c.id}: first alpha`);assert.equal(decoded.last,0,`${c.id}: last alpha`);assert.ok(decoded.middle!>1,`${c.id}: empty midpoint`);assert.equal(decoded.width,1920);assert.equal(decoded.height,1080);assert.ok(Math.abs(decoded.duration-c.seconds)<.05);
  const bytes=(await stat(new URL(`../assets/reactions/${c.id}.webm`,import.meta.url))).size;assert.ok(bytes<2*1024*1024);results.push({...decoded,bytes});console.log(JSON.stringify(results.at(-1)));
 }
 const send=(id:string,text:string)=>pipeline.chat({id,userId:id,displayName:id,color:"#79D7BF",text});
 send("smoke1","LUL");send("smoke2","LUL");send("smoke3","LUL");const video=page.locator(".reaction-takeover");await video.waitFor({state:"visible"});await page.waitForFunction(()=>{const v=document.querySelector<HTMLVideoElement>(".reaction-takeover")!;return v.currentTime>.15&&!v.paused;});
 // Native ended clears; a duplicate state must not replay it.
 await video.evaluate((v:HTMLVideoElement)=>{v.currentTime=v.duration-.12;void v.play();});await video.waitFor({state:"hidden"});send("smoke4","hello");assert.ok(await video.isHidden());
 time+=7000;reactions.tick();for(let i=0;i<12;i++)send(`hype${i}`,"Pog");await video.waitFor({state:"visible"});
 send("mod-pause","hello");time+=300;pipeline.chat({id:"pause",userId:"mod",displayName:"Mod",color:"#79D7BF",text:"!pause"},{moderator:true});await page.waitForFunction(()=>document.querySelector<HTMLVideoElement>(".reaction-takeover")!.paused);
 time+=300;pipeline.chat({id:"resume",userId:"mod",displayName:"Mod",color:"#79D7BF",text:"!pause"},{moderator:true});await page.waitForFunction(()=>!document.querySelector<HTMLVideoElement>(".reaction-takeover")!.paused);
 // Server-clock expiry clears even without a native ended event.
 time+=7000;reactions.tick();await video.waitFor({state:"hidden"});assert.equal(await video.getAttribute("src"),null);
 assert.deepEqual(errors,[]);await mkdir("state",{recursive:true});await writeFile("state/reactions-media-check.json",JSON.stringify({clips:results,playback:"native ended, duplicate state, pause/resume and server expiry passed",errors},null,2)+"\n");
 console.log(`PASS: ${results.length} alpha WebMs + overlay playback/clearing, pause/resume; zero browser errors.`);
}finally{await browser.close();app.closeStreams();app.server.closeAllConnections();await new Promise<void>(r=>app.server.close(()=>r()));}

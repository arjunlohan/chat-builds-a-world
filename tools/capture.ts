import {parseArgs} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {captureBrowser,captureEncoder} from '../checks/capture-browser.js';
const {values}=parseArgs({options:{url:{type:'string',default:'http://127.0.0.1:3000/capture'},frames:{type:'string',default:'600'},fps:{type:'string',default:'60'},out:{type:'string'}}}),frames=Number(values.frames),fps=Number(values.fps);
if(!Number.isInteger(frames)||frames<1||frames>36000||!Number.isFinite(fps)||fps<20||fps>120)throw new Error('Use 1..36000 frames and 20..120 fps');
const url=new URL(values.url);if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('Capture uses the local world server');url.searchParams.set('capture','1');url.searchParams.set('resolution','4k');
const directory=resolve(values.out??`state/capture-${Date.now()}`);await mkdir(directory,{recursive:true});const browser=await captureBrowser();
try{const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:2}),errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));page.on("console",event=>{if(event.type()==="error")errors.push(event.text());});await page.goto(url.href);await page.waitForFunction(()=>!!window.__capture,{timeout:60000});await page.evaluate(()=>window.__capture!.ready);const encode=await captureEncoder(page),start=performance.now();
 for(let frame=0;frame<frames;frame++){const timer=setTimeout(()=>{void browser.close();},30000);try{if(frame)await page.evaluate(dt=>window.__capture!.step(dt),1/fps);const png=await encode();if(png.readUInt32BE(16)!==3840||png.readUInt32BE(20)!==2160)throw new Error("Capture did not produce native 4K pixels");if(errors.length)throw new Error(errors[0]);await writeFile(join(directory,`frame-${String(frame).padStart(6,'0')}.png`),png,{flag:'wx'});if(frame%60===0)console.log(`Captured ${frame+1}/${frames}`);}finally{clearTimeout(timer);}}
 const result={frames,fps,resolution:[3840,2160],durationSeconds:frames/fps,elapsedSeconds:(performance.now()-start)/1000,directory};await writeFile(join(directory,'capture.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}

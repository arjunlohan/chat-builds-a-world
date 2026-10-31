import {chromium,type Browser,type Page} from "@playwright/test";
import type {WorldStats} from "../world/engine/stats.js";
export const WORLD_VIEWPORT=Object.freeze({width:1920,height:1080});
/** Shared hardware browser setup; the isolated SwiftShader candidate worker stays separate. */
export async function launchWorldPage(base:string,query="",options:{browser?:Browser;viewport?:{width:number;height:number};onPage?:(page:Page)=>void}={}) {
 const browser=options.browser??await chromium.launch({headless:true,args:process.platform==="darwin"?["--use-angle=metal","--enable-gpu"]:["--enable-gpu"]});
 try{const errors:string[]=[];const page=await browser.newPage({viewport:options.viewport??WORLD_VIEWPORT});page.on("pageerror",e=>errors.push(e.message));page.on("console",e=>{if(e.type()==="error")errors.push(e.text());});options.onPage?.(page);await page.goto(`${base}/world${query?`?${query.replace(/^\?/,"")}`:""}`);await page.waitForSelector('canvas[data-ready="true"]',{timeout:60000});
  const gpu=await page.evaluate(()=>{const gl=document.querySelector("canvas")!.getContext("webgl2")!,info=gl.getExtension("WEBGL_debug_renderer_info");return info?String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)):"unknown";});return {browser,page,gpu,errors};
 }catch(error){if(!options.browser)await browser.close();throw error;}
}
/** O(1) timing storage even for a long soak; optional work keeps round-wide measurements intact. */
export async function measureFps(page:Page,ms:number,until?:Promise<unknown>):Promise<{fps:number;avgFps:number;elapsedMs:number;stats:WorldStats}> {
 const start=await page.evaluate(()=>({frame:window.__worldStats.frame,time:performance.now()}));await Promise.all([page.waitForTimeout(ms),until]);const end=await page.evaluate(()=>({frame:window.__worldStats.frame,time:performance.now(),stats:window.__worldStats}));return {fps:1000*(end.frame-start.frame)/(end.time-start.time),avgFps:end.stats.avgFps,elapsedMs:end.time-start.time,stats:end.stats};
}

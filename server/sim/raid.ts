import {randomUUID} from "node:crypto";
import {mkdir} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {chromium} from "@playwright/test";
import {readConfig} from "../config.js";
import {raidFixture} from "../twitch/raid.js";
const argument=(name:string)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3);
async function main(){
 const config=readConfig(),base=`http://127.0.0.1:${config.port}`,viewers=Number(argument("viewers")??150),channel=argument("channel")??"AuroraCrew",screenshot=argument("screenshot");
 if(!Number.isInteger(viewers)||viewers<1||viewers>1_000_000||!channel.trim()||channel.length>64)throw new Error("Use --viewers=1..1000000 and a channel name up to 64 characters");
 const browser=screenshot?await chromium.launch({headless:true,args:process.platform==="darwin"?["--use-angle=metal","--enable-gpu"]:["--enable-gpu"]}):undefined;
 try{
  const page=await browser?.newPage({viewport:{width:1920,height:1080}});if(page){await page.goto(base+"/world?overlay=1&debug=1");await page.waitForSelector('canvas[data-ready="true"]');}
  const response=await fetch(base+"/sim/eventsub",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(raidFixture(config.twitch?.broadcasterId??"sim-broadcaster",viewers,channel,randomUUID()))});
  if(!response.ok)throw new Error("Raid simulator unavailable. Start the server with SIMULATION_ALLOWED=1.");const result=await response.json() as {accepted:boolean;admitted:number;count:number};if(!result.accepted)throw new Error("Incoming raid rejected; check the configured broadcaster ID.");
  if(page&&screenshot){await page.waitForFunction(()=>window.__worldStats.raidPortalActive);await page.waitForTimeout(2500);const start=await page.evaluate(()=>({frame:window.__worldStats.frame,time:performance.now()}));await page.screenshot({path:resolve(screenshot)});await page.waitForTimeout(15000);const measured=await page.evaluate(()=>({frame:window.__worldStats.frame,time:performance.now(),avgFps:window.__worldStats.avgFps,citizens:window.__worldStats.citizenCount,framebuffer:[document.querySelector('canvas')!.width,document.querySelector('canvas')!.height]}));console.log(JSON.stringify({...result,channel,viewers,fps:1000*(measured.frame-start.frame)/(measured.time-start.time),...measured,screenshot:resolve(screenshot)}));}
  else console.log(JSON.stringify({...result,channel,viewers,path:"channel.raid EventSub decoder → world pipeline"}));
 }finally{await browser?.close();}
}
const screenshot=argument("screenshot");if(screenshot)await mkdir(dirname(resolve(screenshot)),{recursive:true});
void main().catch(error=>{console.error(error instanceof Error?error.message:"Raid simulation failed");process.exitCode=1;});

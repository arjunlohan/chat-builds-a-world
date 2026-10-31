import {randomUUID} from "node:crypto";
import {mkdir} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {parseArgs} from "node:util";
import {launchWorldPage,measureFps} from "../../checks/browser.js";
import {readConfig} from "../config.js";
import {raidFixture} from "../twitch/raid.js";
const {values}=parseArgs({options:{viewers:{type:"string",default:"150"},channel:{type:"string",default:"AuroraCrew"},screenshot:{type:"string"}}});
async function main(){
 const config=readConfig(),base=`http://127.0.0.1:${config.port}`,viewers=Number(values.viewers),channel=values.channel,screenshot=values.screenshot;
 if(!Number.isInteger(viewers)||viewers<1||viewers>1_000_000||!channel.trim()||channel.length>64)throw new Error("Use --viewers=1..1000000 and a channel name up to 64 characters");
 const world=screenshot?await launchWorldPage(base,"overlay=1&debug=1"):undefined;
 try{
  const page=world?.page;
  const response=await fetch(base+"/sim/eventsub",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(raidFixture(config.broadcasterId,viewers,channel,randomUUID()))});
  if(!response.ok)throw new Error("Raid simulator unavailable. Start the server with SIMULATION_ALLOWED=1.");const result=await response.json() as {accepted:boolean;admitted:number;count:number};if(!result.accepted)throw new Error("Incoming raid rejected; check the configured broadcaster ID.");
  if(page&&screenshot){await page.waitForFunction(()=>window.__worldStats.raidPortalActive);await page.waitForTimeout(2500);await page.screenshot({path:resolve(screenshot)});const measured=await measureFps(page,15000);console.log(JSON.stringify({...result,channel,viewers,fps:measured.fps,avgFps:measured.avgFps,citizens:measured.stats.citizenCount,screenshot:resolve(screenshot)}));}
  else console.log(JSON.stringify({...result,channel,viewers,path:"channel.raid EventSub decoder → world pipeline"}));
 }finally{await world?.browser.close();}
}
const screenshot=values.screenshot;if(screenshot)await mkdir(dirname(resolve(screenshot)),{recursive:true});
void main().catch(error=>{console.error(error instanceof Error?error.message:"Raid simulation failed");process.exitCode=1;});

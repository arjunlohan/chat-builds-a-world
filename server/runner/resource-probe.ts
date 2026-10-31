import {Group,Vector3} from "three";
import {ModuleHost,type ModuleStatus} from "../../world/engine/module-host.js";
import {ResourceLedger,emptyUsage,modulePool,GLOBAL_CAP,usageKeys,CITIZEN_CAP,type Usage} from "../../world/shared/limits.js";
import {parseSceneSpec,specUsage} from "../summon/scene-spec.js";
import type {WorldModuleFactory} from "../../world/engine/api.js";
import {CANDIDATE_THRESHOLDS} from "../../checks/candidate-policy.js";
import {MODULE_BUDGET} from "../../world/engine/module-host.js";
import type {ResourceContext} from "./self-check.js";
const request=await (await fetch("/input.json")).json() as ResourceContext&{modules:ResourceContext["retained"];candidateId?:string};
declare global {interface Window {__resourceResult:import("./self-check.js").SelfCheckResult}}
const pool=request.base?modulePool(request.base):{...GLOBAL_CAP};
const ledger=new ResourceLedger(emptyUsage(),pool),status:ModuleStatus[]=[],root=new Group();let clock=0,serial=0;
const citizens=Object.freeze(Array.from({length:CITIZEN_CAP},(_,i)=>Object.freeze({id:`check-${i}`,displayName:`Neighbor${i}`,color:"#79D7CF",position:Object.freeze(new Vector3(i%10,3,Math.floor(i/10)))})));
const host=new ModuleHost({root,ledger,now:()=>clock,onStatus:s=>status.push(s),services:{citizens:{get:id=>citizens.find(c=>c.id===id),list:()=>citizens},camera:{focus(){}},effects:{play(){}},log(){},spawnSpec:spec=>{
 const usage=specUsage(parseSceneSpec(JSON.stringify(spec))),id=`spec-${++serial}`;ledger.reserve(id,usage);return {id,usage,dispose(){ledger.release(id);}};
}}});
try{
 let retained:Usage=emptyUsage();
 for(const [index,item] of request.modules.entries()){
  const module=await import(`/modules/${index}.js`) as {default:WorldModuleFactory};
  if(!host.load(module.default)||!host.ids.includes(item.id))throw new Error(`${item.id}: ${status.at(-1)?.reason??"Module ID did not match manifest"}`);
  if(item.id!==request.candidateId)retained=ledger.usage();
 }
 for(let i=0;i<CANDIDATE_THRESHOLDS.sampleSeconds/MODULE_BUDGET.maxDtSeconds;i++){clock+=MODULE_BUDGET.maxDtSeconds*1000;host.update(MODULE_BUDGET.maxDtSeconds);if(host.activeCount!==request.modules.length)throw new Error(status.at(-1)?.reason??"Module disabled during resource check");}
 const usage=ledger.usage(),available=Object.fromEntries(usageKeys.map(k=>[k,Math.max(0,pool[k]-retained[k])])) as unknown as Usage;
 window.__resourceResult={ok:true,usage,pool,retained,available};
}catch(error){window.__resourceResult={ok:false,reason:error instanceof Error?error.message:"Resource admission failed",pool};}
finally{host.dispose();}

import {GTAOPass} from "three/addons/postprocessing/GTAOPass.js";
import type {Scene,Camera} from "three";
import {random} from "./land.js";
export const AO_SCALE=.5;
/** Stable spatial noise, short contact radius and depth-aware denoise avoid silhouette halos. */
export function ambientOcclusion(scene:Scene,camera:Camera,width:number,height:number){
 const saved=Math.random;let ao:GTAOPass;try{Math.random=random(7331);ao=new GTAOPass(scene,camera,width,height);}finally{Math.random=saved;}
 const setSize=ao.setSize.bind(ao);ao.setSize=(w,h)=>setSize(Math.max(1,Math.round(w*AO_SCALE)),Math.max(1,Math.round(h*AO_SCALE)));ao.setSize(width,height);
 ao.blendIntensity=.4;ao.updateGtaoMaterial({radius:.22,thickness:.5,distanceFallOff:.8,samples:8});ao.updatePdMaterial({samples:8,rings:2,radius:3,lumaPhi:4,depthPhi:4,normalPhi:8});return ao;
}

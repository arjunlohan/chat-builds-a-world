import {GTAOPass} from "three/addons/postprocessing/GTAOPass.js";
import type {Scene,Camera} from "three";
import {random} from "./land.js";
/** Stable spatial noise, short contact radius and depth-aware denoise avoid silhouette halos. */
export function ambientOcclusion(scene:Scene,camera:Camera,width:number,height:number){
 const saved=Math.random;let ao:GTAOPass;try{Math.random=random(7331);ao=new GTAOPass(scene,camera,width,height);}finally{Math.random=saved;}
 ao.blendIntensity=.45;ao.updateGtaoMaterial({radius:.28,thickness:.5,distanceFallOff:.8,samples:8});ao.updatePdMaterial({samples:8,rings:2,radius:3,lumaPhi:4,depthPhi:4,normalPhi:8});return ao;
}

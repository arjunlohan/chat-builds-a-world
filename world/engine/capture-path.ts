import {ESTABLISHING_POSE as HOME} from "./camera-director.js";
import {Vector3,type PerspectiveCamera,type Box3} from "three";
export type CapturePath="fixed"|"orbit"|"push-in"|"flyover";
export function capturePath(camera:PerspectiveCamera,path:CapturePath,time:number,bounds:Box3){
 const center=bounds.isEmpty()?new Vector3(0,2,0):bounds.getCenter(new Vector3()),size=bounds.isEmpty()?3:bounds.getSize(new Vector3()).length();
 if(path==="push-in"){const t=Math.min(1,time/12),distance=Math.max(7,size*1.7)+(1-t*t*(3-2*t))*15;camera.position.copy(center).add(new Vector3(-.6,.4,.8).normalize().multiplyScalar(distance));camera.lookAt(center);}
 else if(path==="flyover"){camera.position.set(-14+Math.sin(time*.035)*20,6.5,16-Math.sin(time*.025)*7);camera.lookAt(0,2,0);}
 else{const angle=HOME.angle+(path==="orbit"?time*.025:0);camera.position.set(Math.sin(angle)*HOME.radius,HOME.height,Math.cos(angle)*HOME.radius);camera.lookAt(...HOME.lookAt);}
 camera.updateMatrixWorld();
}

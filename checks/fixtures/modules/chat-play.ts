import type {WorldModule,WorldServices} from "../../../world/engine/api.js";
import {Mesh,IcosahedronGeometry,MeshBasicMaterial} from "three";
export default ():WorldModule=>{
 let services:WorldServices|undefined,body:Mesh,marker:Mesh,anchored=false,won=false,time=0;
 const scores=new Map<string,number>();
 return {id:"FIXTURE_ID",
  init(s){services=s;body=new Mesh(new IcosahedronGeometry(1.8,0),new MeshBasicMaterial({color:"#FCA9D5"}));marker=new Mesh(new IcosahedronGeometry(.6,0),new MeshBasicMaterial({color:"#FFED72"}));body.visible=false;marker.visible=false;s.scene.add(body,marker);},
  update(dt){time+=dt;body.rotation.y=time*.3;marker.rotation.y=time;},
  onChat(event){
   const s=services;if(event.text!=="!race"||!s)return;
   const citizen=s.citizens.get(event.userId);if(!citizen)return;if(!scores.has(citizen.id)&&scores.size>=10)return;
   const score=(scores.get(citizen.id)??0)+1;scores.set(citizen.id,score);
   if(!anchored){anchored=true;body.position.copy(citizen.position);body.position.x-=2;body.position.y+=4;body.visible=true;s.camera.focus(citizen.position,{duration:1.5,priority:1});}
   if(score>=3&&!won){won=true;marker.position.copy(citizen.position);marker.position.y+=1.2;marker.visible=true;s.camera.focus(citizen.position,{duration:1.5,priority:3});}
  },onCitizenSpawn(){},onRaid(){},dispose(){body.geometry.dispose();marker.geometry.dispose();(body.material as MeshBasicMaterial).dispose();(marker.material as MeshBasicMaterial).dispose();body.removeFromParent();marker.removeFromParent();scores.clear();services=undefined;}
 };
};

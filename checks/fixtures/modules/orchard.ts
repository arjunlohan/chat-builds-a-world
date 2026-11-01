import type {WorldModule,SpawnHandle} from '../../../world/engine/api.js';
export default ():WorldModule=>{
 let handle:SpawnHandle|undefined;
 return {id:'FIXTURE_ID',init(services){handle=services.spawnSpec({version:1,name:'Lantern orchard',geometries:[{id:'lamp',kind:'lantern',size:[.8,1.6,.8],detail:0}],materials:[{id:'warm',preset:'wood',color:'#fff3dc',emissive:'#f7c178',emissiveIntensity:.25,roughness:.74,metalness:0,opacity:1}],nodes:[
  {id:'left',geometryId:'lamp',materialId:'warm',position:[-4.6,3.25,-1.3],rotation:[0,.2,0],scale:[1,1,1]},
  {id:'middle',geometryId:'lamp',materialId:'warm',position:[-3.2,3.25,-1.8],rotation:[0,.5,0],scale:[1,1,1]},
  {id:'right',geometryId:'lamp',materialId:'warm',position:[-1.8,3.35,-1.4],rotation:[0,.8,0],scale:[1,1,1]},
 ],lights:[],emitters:[],behaviors:[{id:'sway',kind:'float',targetId:'middle',speed:1,amplitude:.035,radius:0}]});},update(){},onChat(){},onCitizenSpawn(){},onRaid(){},dispose(){handle?.dispose();handle=undefined;}};
};

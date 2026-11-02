import type {WorldModule,SpawnHandle} from '../../../world/engine/api.js';
export default ():WorldModule=>{
 let handle:SpawnHandle|undefined;
 return {id:'FIXTURE_ID',init(services){const kind=['lan','tern'].join('') as 'lantern';handle=services.spawnSpec({version:1,name:'Lantern orchard',geometries:[{id:'lamp',kind,size:[.45,.8,.45],detail:0}],materials:[{id:'warm',preset:'wood',color:'#fff3dc',emissive:'#f7c178',emissiveIntensity:1.4,roughness:.74,metalness:0,opacity:1}],nodes:[
  {id:'left',geometryId:'lamp',materialId:'warm',position:[-4.6,2.22,-1.3],rotation:[0,.2,0],scale:[1,1,1]},
  {id:'left-middle',geometryId:'lamp',materialId:'warm',position:[-3.9,2.46,-1.65],rotation:[0,.4,0],scale:[1,1,1]},
  {id:'right-middle',geometryId:'lamp',materialId:'warm',position:[-2.5,2.74,-1.6],rotation:[0,.7,0],scale:[1,1,1]},
  {id:'middle',geometryId:'lamp',materialId:'warm',position:[-3.2,2.62,-1.8],rotation:[0,.5,0],scale:[1,1,1]},
  {id:'right',geometryId:'lamp',materialId:'warm',position:[-1.8,2.79,-1.4],rotation:[0,.8,0],scale:[1,1,1]},
 ],lights:[],emitters:[],behaviors:[{id:'sway',kind:'float',targetId:'middle',speed:1,amplitude:.035,radius:0}]});},update(){},onChat(){},onCitizenSpawn(){},onRaid(){},dispose(){handle?.dispose();handle=undefined;}};
};

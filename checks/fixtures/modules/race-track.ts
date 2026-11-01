import type {WorldModule,SpawnHandle} from '../../../world/engine/api.js';
export default ():WorldModule=>{
 let handle:SpawnHandle|undefined;
 return {id:'FIXTURE_ID',init(services){handle=services.spawnSpec({version:1,name:'Woodland track',geometries:[{id:'planks',kind:'bridge-planks',size:[3,.12,1],detail:0},{id:'crate',kind:'crate',size:[.65,.65,.65],detail:0}],materials:[{id:'wood',preset:'weathered-wood',color:'#efd9b0',emissive:'#000000',emissiveIntensity:0,roughness:.94,metalness:0,opacity:1}],nodes:[{id:'lane',geometryId:'planks',materialId:'wood',position:[1.5,2.6,4],rotation:[0,0,0],scale:[1,1,1]},{id:'start',geometryId:'crate',materialId:'wood',position:[-.5,2.7,4],rotation:[0,.3,0],scale:[1,1,1]},{id:'finish',geometryId:'crate',materialId:'wood',position:[3.5,2.7,4],rotation:[0,-.3,0],scale:[1,1,1]}],lights:[],emitters:[],behaviors:[]});},update(){},onChat(){},onCitizenSpawn(){},onRaid(){},dispose(){handle?.dispose();handle=undefined;}};
};

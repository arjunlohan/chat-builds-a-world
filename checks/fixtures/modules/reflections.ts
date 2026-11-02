import type {WorldModule,SpawnHandle} from '../../../world/engine/api.js';
export default ():WorldModule=>{let handle:SpawnHandle|undefined;return {id:'FIXTURE_ID',init(s){handle=s.spawnSpec({version:1,name:'Reflection study',geometries:[{id:'orb',kind:'sphere',size:[1.25,1.25,1.25],detail:0},{id:'box',kind:'box',size:[1,1.4,1],detail:0}],materials:[
{id:'iron',preset:'iron',color:'#d9e6ed',emissive:'#000000',emissiveIntensity:0,roughness:.56,metalness:.94,opacity:1},
{id:'brass',preset:'brass',color:'#e5c47b',emissive:'#000000',emissiveIntensity:0,roughness:.34,metalness:.9,opacity:1},
{id:'glass',preset:'glass',color:'#d9efff',emissive:'#000000',emissiveIntensity:0,roughness:.08,metalness:.05,opacity:.35}],nodes:[
{id:'iron-orb',geometryId:'orb',materialId:'iron',position:[-3.6,3.8,-1.2],rotation:[0,0,0],scale:[1,1,1]},
{id:'brass-orb',geometryId:'orb',materialId:'brass',position:[-1.6,3.8,-1.2],rotation:[0,0,0],scale:[1,1,1]},
{id:'glass-box',geometryId:'box',materialId:'glass',position:[.5,3.8,-1.2],rotation:[0,.4,0],scale:[1,1,1]}],lights:[],emitters:[],behaviors:[]});},update(){},onChat(){},onCitizenSpawn(){},onRaid(){},dispose(){handle?.dispose();handle=undefined;}};};

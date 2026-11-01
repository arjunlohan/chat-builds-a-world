import {presetMaterial} from "./pbr-kit.js";
import type {MaterialPreset} from "../shared/material-kit.js";
export {presetMaterial as kitMaterial} from "./pbr-kit.js";
import {MeshPhysicalMaterial,MeshStandardMaterial,type MeshStandardMaterialParameters,type BufferGeometry} from "three";
import {toCreasedNormals} from "three/addons/utils/BufferGeometryUtils.js";
import type {WorldLook} from "./render-profile.js";
/** Shared surface entrypoint for the procedural world and data-only summon recipes. */
export function surfaceMaterial(parameters:MeshStandardMaterialParameters,look:WorldLook="new",preset?:MaterialPreset){
 if(look!=="classic"&&preset)return presetMaterial(parameters,preset,look);
 return new MeshStandardMaterial({...parameters,flatShading:look==="classic"&&!!parameters.flatShading});
}
export function surfaceNormals(geometry:BufferGeometry,look:WorldLook="new",crease=Math.PI){if(look==="classic")return geometry;const result=toCreasedNormals(geometry,crease);if(result!==geometry)geometry.dispose();return result;}

/** Soft cloth-like sheen on creature fur; the classic escape hatch retains its palette and shader. */
export function creatureMaterial(look:WorldLook){return look==='classic'?surfaceMaterial({color:'#ffffff',vertexColors:true,roughness:.9,flatShading:true},look):new MeshPhysicalMaterial({color:'#ffffff',vertexColors:true,roughness:.88,sheen:.55,sheenColor:'#d4ddd3',sheenRoughness:1});}

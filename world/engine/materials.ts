import {MeshStandardMaterial,type MeshStandardMaterialParameters,type BufferGeometry} from "three";
import {toCreasedNormals} from "three/addons/utils/BufferGeometryUtils.js";
import type {WorldLook} from "./render-profile.js";
/** Shared surface entrypoint for the procedural world and data-only summon recipes. */
export function surfaceMaterial(parameters:MeshStandardMaterialParameters,look:WorldLook="new"){
 return new MeshStandardMaterial({...parameters,flatShading:look==="classic"&&!!parameters.flatShading});
}
export function surfaceNormals(geometry:BufferGeometry,look:WorldLook="new",crease=Math.PI){if(look==="classic")return geometry;const result=toCreasedNormals(geometry,crease);if(result!==geometry)geometry.dispose();return result;}

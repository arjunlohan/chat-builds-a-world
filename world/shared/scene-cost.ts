import {MODEL_KIT,isModelKind,type GeometryKind} from "./model-kit.js";
import type {WorldLook} from "../engine/render-profile.js";
export function triangleCost(kind: GeometryKind, detail: number,look:WorldLook="new") {
  if(isModelKind(kind)){const model=MODEL_KIT[kind];return detail===0?model.lowTriangles:model.triangles;}
  const w = (look==="classic"?8:16) + detail * 4, h = (look==="classic"?4:8) + detail * 2;
  return { box: look==="classic"?12:300, sphere: 2 * w * (h - 1), cylinder: 4 * w, cone: 2 * w,
    torus: 2 * w * (look==="classic"?6:10), plane: 2, crystal: 20, mushroom: 2 * w * (h - 1) + 4 * w, tree: look==="classic"?424:448 }[kind];
}
export function drawCost(kind:GeometryKind,detail:number){return isModelKind(kind)?(detail===0?MODEL_KIT[kind].lowDraws:MODEL_KIT[kind].draws):1;}

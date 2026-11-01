import {MeshBasicMaterial,type Material,type Texture} from 'three';
/** Borrow alpha data and vertex deformation; disposing the mask never disposes source textures. */
export function bloomOccluder(source:Material){
 const cutout=source as Material&{map?:Texture|null;alphaMap?:Texture|null};
 const mask=new MeshBasicMaterial({color:0,fog:true,map:cutout.map??null,alphaMap:cutout.alphaMap??null,alphaTest:source.alphaTest,opacity:source.opacity,transparent:source.transparent,side:source.side,depthWrite:source.depthWrite,depthTest:source.depthTest,alphaToCoverage:source.alphaToCoverage,forceSinglePass:true});
 mask.onBeforeCompile=(shader,renderer)=>source.onBeforeCompile(shader,renderer);
 mask.customProgramCacheKey=()=>`bloom-alpha:${source.customProgramCacheKey()}`;
 return mask;
}

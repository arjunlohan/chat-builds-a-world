export const ASSET_LOAD_ATTEMPTS=3;
export class AssetLoadError extends Error {}
/** Same-origin data can fail transiently; retain a clear bounded boot/activation failure. */
export async function loadAssets(load:()=>Promise<void>,report?:(message:string)=>void){
 for(let attempt=1;attempt<=ASSET_LOAD_ATTEMPTS;attempt++){
  try{await load();return;}catch{if(attempt===ASSET_LOAD_ATTEMPTS)throw new AssetLoadError('World assets could not load after 3 attempts. Check the local server, then reload.');report?.(`Loading world assets: retry ${attempt+1}/${ASSET_LOAD_ATTEMPTS}.`);}
 }
}

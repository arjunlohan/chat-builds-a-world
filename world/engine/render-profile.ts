export type WorldLook="classic"|"new";
export interface RenderProfile { width:number; height:number; shadows:boolean; bloom:boolean; probe:boolean; look?:WorldLook; forceSmaa?:boolean }
export const PRODUCTION_PROFILE:Readonly<RenderProfile>=Object.freeze({width:1920,height:1080,shadows:true,bloom:true,probe:false,look:"new"});
export const CAPTURE_4K_PROFILE:Readonly<RenderProfile>=Object.freeze({...PRODUCTION_PROFILE,width:3840,height:2160});
/** Every production pass is retained; only resolution changes in the candidate checker. */
export const CANDIDATE_PROFILE:Readonly<RenderProfile>=Object.freeze({...PRODUCTION_PROFILE,width:160,height:90,probe:true});
export function pageProfile(query:URLSearchParams,defaultLook:WorldLook="new"):Readonly<RenderProfile>{
 const look=query.get("look")==="classic"?"classic":query.get("look")==="new"?"new":defaultLook;
 const base=query.get("check")==="1"?CANDIDATE_PROFILE:query.get("resolution")==="4k"?CAPTURE_4K_PROFILE:PRODUCTION_PROFILE;
 return {...base,look,forceSmaa:query.get("aa")==="smaa"};
}

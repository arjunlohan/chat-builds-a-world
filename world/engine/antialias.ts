import {HalfFloatType,WebGLRenderTarget,type WebGLRenderer} from "three";
import {SMAAPass} from "three/addons/postprocessing/SMAAPass.js";
import type {RenderProfile} from "./render-profile.js";
export function antialiasTarget(renderer:WebGLRenderer,profile:Readonly<RenderProfile>){
 const gl=renderer.getContext() as WebGL2RenderingContext,supported=typeof gl.getInternalformatParameter==="function"?gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA16F,gl.SAMPLES) as Int32Array|null:null;
 const samples=profile.look!=="classic"&&!profile.forceSmaa&&supported?.includes(4)?4:0;
 return {target:new WebGLRenderTarget(profile.width,profile.height,{type:HalfFloatType,samples,resolveDepthBuffer:false}),samples,smaa:profile.look!=="classic"&&!samples?new SMAAPass():undefined};
}

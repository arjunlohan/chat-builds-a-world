import {HalfFloatType,ShaderMaterial,WebGLRenderTarget,Vector2,type WebGLRenderer,type Scene,type Camera} from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {Pass,FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {antialiasTarget} from './antialias.js';import {ambientOcclusion} from './ambient-occlusion.js';import {SelectiveBloomPass} from './selective-bloom.js';import type {RenderProfile} from './render-profile.js';
/** Resolve the scene once. Every subsequent fullscreen operation is single-sample, without depth. */
class SceneInput extends Pass{
 private material=new ShaderMaterial({uniforms:{map:{value:null}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec2 vUv;uniform sampler2D map;void main(){gl_FragColor=texture2D(map,vUv);}'});
 private quad=new FullScreenQuad(this.material);
 constructor(private scene:Scene,private camera:Camera,readonly target:WebGLRenderTarget){super();this.needsSwap=false;}
 override setSize(w:number,h:number){this.target.setSize(w,h);}
 override render(renderer:WebGLRenderer,_write:WebGLRenderTarget,read:WebGLRenderTarget){renderer.setRenderTarget(this.target);renderer.clear();renderer.render(this.scene,this.camera);this.material.uniforms.map!.value=this.target.texture;renderer.setRenderTarget(read);this.quad.render(renderer);}
 override dispose(){this.target.dispose();this.material.dispose();this.quad.dispose();}
}
export function pipelinePasses(profile:Readonly<RenderProfile>,measurement=false){const passes=['main'];if(!measurement&&profile.look!=='classic')passes.push('gtao');if(!measurement&&profile.bloom)passes.push(profile.look==='classic'?'bloom':'emissive-bloom');passes.push('output');return passes;}
/** Live output and all visibility probes share this factory. Measurement deliberately omits post effects. */
export function worldPipeline(renderer:WebGLRenderer,scene:Scene,camera:Camera,profile:Readonly<RenderProfile>,measurement=false){
 const aa=measurement?{target:new WebGLRenderTarget(profile.width,profile.height,{type:HalfFloatType,resolveDepthBuffer:false}),samples:0,smaa:undefined}:antialiasTarget(renderer,profile);
 const post=new WebGLRenderTarget(profile.width,profile.height,{type:HalfFloatType,depthBuffer:false,resolveDepthBuffer:false});
 const composer=new EffectComposer(renderer,post),render=new SceneInput(scene,camera,aa.target),output=new OutputPass(),passes=pipelinePasses(profile,measurement);composer.addPass(render);
 const ao=!measurement&&profile.look!=='classic'?ambientOcclusion(scene,camera,profile.width,profile.height):undefined;
 const bloom=!measurement&&profile.bloom?(profile.look!=='classic'?new SelectiveBloomPass(renderer,scene,camera,profile.width,profile.height):new UnrealBloomPass(new Vector2(profile.width/2,profile.height/2),.38,.65,1.05)):undefined;
 if(ao)composer.addPass(ao);if(bloom)composer.addPass(bloom);if(aa.smaa){composer.addPass(aa.smaa);passes.splice(-1,0,'smaa');}composer.addPass(output);composer.setSize(profile.width,profile.height);
 return {composer,passes,samples:{scene:aa.samples,post:composer.renderTarget1.samples,normal:ao?(ao as typeof ao&{normalRenderTarget:WebGLRenderTarget}).normalRenderTarget.samples:0},aa:aa.samples?`msaa-${aa.samples}`:aa.smaa?'smaa':'none',render(dt:number,screen=true){composer.renderToScreen=screen;composer.render(dt);},dispose(){render.dispose();ao?.dispose();bloom?.dispose();aa.smaa?.dispose();output.dispose();composer.dispose();}};
}

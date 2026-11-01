import {AdditiveBlending,Color,HalfFloatType,Material,Mesh,MeshBasicMaterial,Points,ShaderMaterial,Vector2,WebGLRenderTarget,type Scene,type Camera,type WebGLRenderer} from "three";
import {EffectComposer} from "three/addons/postprocessing/EffectComposer.js";
import {RenderPass} from "three/addons/postprocessing/RenderPass.js";
import {UnrealBloomPass} from "three/addons/postprocessing/UnrealBloomPass.js";
import {Pass,FullScreenQuad} from "three/addons/postprocessing/Pass.js";
import {bloomOccluder} from './bloom-occluder.js';
export function emitsBloom(material:Material){
 const m=material as Material&{emissive?:Color;emissiveIntensity?:number;color?:Color};
 return !!material.userData.emitsBloom||!!m.emissive&&m.emissive.getHex()!==0&&(m.emissiveIntensity??0)>0||material.blending===AdditiveBlending||material instanceof MeshBasicMaterial&&!!m.color&&Math.max(m.color.r,m.color.g,m.color.b)>1;
}
/** Half-size emissive-only render, depth-masked by black world geometry, then additive HDR composition. */
export class SelectiveBloomPass extends Pass{
 private composer:EffectComposer;private bloom:UnrealBloomPass;private renderPass:RenderPass;
 private black=new MeshBasicMaterial({color:0,fog:true});
 private masks=new Map<Material,{mask:MeshBasicMaterial;release:()=>void}>();
 private mask(source:Material){if(!source.alphaTest&&!source.transparent)return this.black;let entry=this.masks.get(source);if(!entry){const mask=bloomOccluder(source),release=()=>{source.removeEventListener('dispose',release);mask.dispose();this.masks.delete(source);};entry={mask,release};this.masks.set(source,entry);source.addEventListener('dispose',release);}entry.mask.opacity=source.opacity;entry.mask.alphaTest=source.alphaTest;return entry.mask;}
 private material=new ShaderMaterial({uniforms:{base:{value:null},glow:{value:null}},vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec2 vUv;uniform sampler2D base,glow;void main(){gl_FragColor=texture2D(base,vUv)+vec4(texture2D(glow,vUv).rgb,0.0);}'});
 private quad=new FullScreenQuad(this.material);
 constructor(renderer:WebGLRenderer,private scene:Scene,camera:Camera,width:number,height:number){super();this.composer=new EffectComposer(renderer,new WebGLRenderTarget(width/2,height/2,{type:HalfFloatType,resolveDepthBuffer:false}));this.composer.renderToScreen=false;this.renderPass=new RenderPass(scene,camera);this.bloom=new UnrealBloomPass(new Vector2(width/2,height/2),.3,.6,1.05);this.composer.addPass(this.renderPass);this.composer.addPass(this.bloom);this.setSize(width,height);}
 override setSize(width:number,height:number){this.composer.setSize(Math.max(1,Math.round(width/2)),Math.max(1,Math.round(height/2)));}
 override render(renderer:WebGLRenderer,write:WebGLRenderTarget,read:WebGLRenderTarget,dt:number){
  const saved:{mesh:Mesh|Points;material:Material|Material[]}[]=[],hidden:Points[]=[];
  try{this.scene.traverseVisible(object=>{if(!(object instanceof Mesh||object instanceof Points))return;const materials=Array.isArray(object.material)?object.material:[object.material];if(materials.every(emitsBloom))return;if(object instanceof Points){object.visible=false;hidden.push(object);}else{saved.push({mesh:object,material:object.material});object.material=Array.isArray(object.material)?materials.map(material=>emitsBloom(material)?material:this.mask(material)):this.mask(materials[0]!);}});this.composer.render(dt);}
  finally{for(const item of saved)item.mesh.material=item.material;for(const point of hidden)point.visible=true;}
  this.material.uniforms.base!.value=read.texture;this.material.uniforms.glow!.value=this.bloom.renderTargetsHorizontal[0]!.texture;renderer.setRenderTarget(this.renderToScreen?null:write);this.quad.render(renderer);
 }
 override dispose(){this.renderPass.dispose();this.bloom.dispose();this.composer.dispose();this.black.dispose();for(const[source,entry]of this.masks){source.removeEventListener('dispose',entry.release);entry.mask.dispose();}this.masks.clear();this.material.dispose();this.quad.dispose();}
}

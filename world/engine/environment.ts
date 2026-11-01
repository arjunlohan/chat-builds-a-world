import {CubeCamera,HalfFloatType,PMREMGenerator,Scene,ShaderMaterial,WebGLCubeRenderTarget,type Mesh,type WebGLRenderer} from 'three';
import {environmentChanged,type SkyLighting} from '../shared/sky-cycle.js';
/** Stable texture identity: lighting thresholds trigger a rebake into the same PMREM target. */
export function skyEnvironment(renderer:WebGLRenderer,scene:Scene,sky:Mesh){
 const generator=new PMREMGenerator(renderer),skyScene=new Scene(),copy=sky.clone();
 if(sky.material instanceof ShaderMaterial){const material=sky.material.clone();material.uniforms={...sky.material.uniforms,uEnvironment:{value:1}};copy.material=material;}
 skyScene.add(copy);const cube=new WebGLCubeRenderTarget(128,{type:HalfFloatType,depthBuffer:false}),camera=new CubeCamera(.1,300,cube);
 let target:WebGLCubeRenderTarget|undefined,last:SkyLighting|undefined,bakes=0;
 return {update(lighting:SkyLighting){if(!environmentChanged(last,lighting))return false;camera.update(renderer,skyScene);target=generator.fromCubemap(cube.texture,target??null);if(scene.environment!==target.texture)scene.environment=target.texture;last={day:lighting.day,warmth:lighting.warmth,sun:[...lighting.sun]};bakes++;return true;},get bakes(){return bakes;},dispose(){scene.environment=null;target?.dispose();cube.dispose();generator.dispose();if(copy.material instanceof ShaderMaterial)copy.material.dispose();skyScene.clear();}};
}

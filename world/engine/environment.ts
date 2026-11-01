import {PMREMGenerator,Scene,type Mesh,type WebGLRenderer,type WebGLRenderTarget} from "three";
/** Sky radiance only, never a capture of the island. Small PMREM updates follow the virtual/live clock. */
export function skyEnvironment(renderer:WebGLRenderer,scene:Scene,sky:Mesh){
 const generator=new PMREMGenerator(renderer),skyScene=new Scene();skyScene.add(sky.clone());
 let target:WebGLRenderTarget|undefined,lastPhase=Infinity;
 return {update(phase:number){if(Math.abs(phase-lastPhase)<.025)return;const next=generator.fromScene(skyScene,.04,.1,300,{size:128});scene.environment=next.texture;target?.dispose();target=next;lastPhase=phase;},dispose(){scene.environment=null;target?.dispose();generator.dispose();skyScene.clear();}};
}

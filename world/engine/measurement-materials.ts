import {Color,Material,Mesh,MeshLambertMaterial,Points,ShaderMaterial,type Object3D,type Texture,type WebGLRenderer} from 'three';
export const COST_MATERIAL_POLICY='The engine base uses fixed Lambert/flat-shader proxies in cost slices; module geometry and materials stay native. Full-look probes restore every original material.';
/** Keep the fixed engine's PBR art out of module admission cost. Geometry, alpha holes and vertex motion remain. */
export class MeasurementMaterials {
 private readonly items:{object:Mesh|Points;source:Material|Material[];cost:Material|Material[]}[]=[];
 private readonly proxies=new Map<Material,Material>();
 constructor(root:Object3D){root.traverse(object=>{if(!(object instanceof Mesh||object instanceof Points))return;const source=object.material;this.items.push({object,source,cost:Array.isArray(source)?source.map(m=>this.proxy(m)):this.proxy(source)});});}
 private proxy(source:Material){
  let proxy=this.proxies.get(source);if(proxy)return proxy;
  const s=source as Material&{color?:Color;map?:Texture|null;vertexColors?:boolean;emissive?:Color};
  if(source instanceof ShaderMaterial){
   proxy=new ShaderMaterial({vertexShader:source.vertexShader,fragmentShader:'uniform vec3 uCostColor;uniform float uCostOpacity;void main(){gl_FragColor=vec4(uCostColor,uCostOpacity);}',uniforms:{...source.uniforms,uCostColor:{value:new Color('#a1afb4')},uCostOpacity:{value:source.opacity}},defines:{...source.defines},side:source.side,depthWrite:source.depthWrite,depthTest:source.depthTest,transparent:source.transparent});
  }else{
   const lambert=new MeshLambertMaterial({color:s.color??'#90a48b',vertexColors:!!s.vertexColors,side:source.side,transparent:source.transparent,opacity:source.opacity,depthWrite:source.depthWrite,depthTest:source.depthTest,alphaTest:source.alphaTest,...(source.alphaTest>0&&s.map?{map:s.map}:{})});
   if(s.color)lambert.color=s.color;if(s.emissive)lambert.emissive=s.emissive;
   // Reuse only the engine's vertex modifications, never its PBR fragment work.
   lambert.onBeforeCompile=(shader,renderer)=>{const copy={...shader,uniforms:shader.uniforms};source.onBeforeCompile(copy,renderer);shader.vertexShader=copy.vertexShader;shader.uniforms=copy.uniforms;};
   lambert.customProgramCacheKey=()=>`cost-vertex-${source.customProgramCacheKey()}`;proxy=lambert;
  }
  this.proxies.set(source,proxy);return proxy;
 }
 enter(){for(const item of this.items)item.object.material=item.cost;}
 leave(){for(const item of this.items)item.object.material=item.source;}
 dispose(){this.leave();for(const material of this.proxies.values())material.dispose();this.proxies.clear();this.items.length=0;}
}

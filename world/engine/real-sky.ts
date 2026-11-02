import {BackSide,Color,DirectionalLight,FogExp2,Group,HemisphereLight,Matrix3,Matrix4,Mesh,InstancedMesh,Object3D,PlaneGeometry,Quaternion,ShaderMaterial,SphereGeometry,Vector3,type Scene} from 'three';
import {random} from "./land.js";
import {assetSky,assetClouds} from './asset-bank.js';import {DAY_CYCLE_SECONDS,skyCycle,GOLDEN_LIGHT} from '../shared/sky-cycle.js';
// Radiance-weighted center of the sun disc in the committed HDR, OpenGL equirectangular coordinates.
const SOURCE_SUN=new Vector3(.5543427604,.7417386882,.3775285717);
export function createRealSky(scene:Scene,fixedTime:number|undefined,shadowSize:number){
 const root=new Group(),rotation=new Matrix3(),quaternion=new Quaternion(),matrix=new Matrix4(),sun=new Vector3(),tint=new Color(),fogColor=new Color();
 const uniforms={uSky:{value:assetSky()},uCloud:{value:assetClouds()},uRotation:{value:rotation},uDay:{value:1},uWarmth:{value:0},uTint:{value:tint},uFog:{value:fogColor},uEnvironment:{value:0},uTime:{value:0}};
 const sky=new Mesh(new SphereGeometry(180,24,12),new ShaderMaterial({uniforms,side:BackSide,depthWrite:false,
  vertexShader:'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:`varying vec3 vDirection;uniform sampler2D uSky;uniform mat3 uRotation;uniform vec3 uTint,uFog;uniform float uDay,uWarmth,uEnvironment,uTime;
   vec2 panorama(vec3 d){return vec2(atan(d.z,d.x)*.159154943+.5,asin(clamp(d.y,-1.0,1.0))*.318309886+.5);}
   void main(){vec3 d=normalize(vDirection);
    // The diorama camera looks down below the geographic horizon. Lift only the
    // displayed panorama, keeping the physical environment and sun directions intact.
    vec3 viewSky=normalize(vec3(d.x,d.y+mix(.48,0.0,uEnvironment),d.z));
    vec3 source=normalize(uRotation*viewSky);source.y=max(.025,source.y);source=normalize(source);
    vec3 photo=texture2D(uSky,panorama(source)).rgb;
    photo=min(photo,vec3(mix(8000.0,16.0,uEnvironment)));vec3 c=photo*mix(vec3(.007,.013,.026),uTint*mix(.75,.65,uEnvironment),uDay);
    // Keep photographed cloud structure while separating blue overhead scattering
    // from amber horizon light instead of grading the entire panorama orange.
    float height=smoothstep(-.04,.6,viewSky.y),cloud=smoothstep(.45,1.25,dot(photo,vec3(.2126,.7152,.0722)));
    vec3 clearGolden=mix(vec3(.95,.48,.19),vec3(.075,.25,.54),height);
    vec3 cloudGolden=mix(vec3(1.18,.96,.72),vec3(1.08,1.16,1.3),height);
    c=mix(c,mix(clearGolden,cloudGolden,cloud),uWarmth*.72);
    c=mix(uFog*.55,c,smoothstep(-.4,.1,viewSky.y));gl_FragColor=vec4(c,1.0);}`,
 }));sky.name='HDR sky and matched sun';sky.frustumCulled=false;sky.material.userData.emitsBloom=true;root.add(sky);
 const hemisphere=new HemisphereLight('#bfcfdc','#10171d',.25),sunlight=new DirectionalLight('#fff0d7',3.1);sunlight.castShadow=true;sunlight.shadow.mapSize.set(shadowSize,shadowSize);Object.assign(sunlight.shadow.camera,{left:-13,right:13,top:13,bottom:-13,near:1,far:70});sunlight.shadow.normalBias=.035;sunlight.shadow.bias=-.0003;sunlight.shadow.radius=3;sunlight.target.position.set(0,1.5,0);root.add(hemisphere,sunlight,sunlight.target);
 const fog=new FogExp2('#8cb9d4',.0028);scene.fog=fog;
 const cloudMaterial=new ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:2,
  vertexShader:`varying vec2 vUv;varying float vDistance;void main(){vUv=uv;vec4 center=modelViewMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0);vDistance=length(center.xyz);center.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));gl_Position=projectionMatrix*center;}`,
  fragmentShader:`varying vec2 vUv;varying float vDistance;uniform sampler2D uCloud;uniform vec3 uTint,uFog;uniform float uTime,uDay;
   void main(){vec4 photo=texture2D(uCloud,vUv);if(photo.a<.005)discard;vec3 c=mix(vec3(.035,.065,.12),uTint*(vec3(.55)+photo.rgb*.45),uDay);float haze=1.0-exp(-.002*vDistance);c=mix(c,uFog,haze);float edge=1.0-smoothstep(.45,1.0,length((vUv-.5)*2.0));gl_FragColor=vec4(c,photo.a*edge*.8);}`,
 });
 const clouds=new InstancedMesh(new PlaneGeometry(1,1),cloudMaterial,40),dummy=new Object3D(),rng=random(199),cloudPositions:{x:number;y:number;z:number;s:number;phase:number}[]=[];
 for(let i=0;i<clouds.count;i++){const a=i/clouds.count*Math.PI*2,r=28+rng()*65,s=18+rng()*18;cloudPositions.push({x:Math.cos(a)*r,y:-13-rng()*4,z:Math.sin(a)*r,s,phase:rng()*6.28});}
 cloudMaterial.userData.emitsBloom=true;clouds.name='photographic cloud sea';clouds.frustumCulled=false;root.add(clouds);
 function moveClouds(time:number){for(let i=0;i<cloudPositions.length;i++){const p=cloudPositions[i]!;dummy.position.set(p.x+Math.sin(time*.004+p.phase)*1.5,p.y+Math.sin(time*.008+p.phase)*.2,p.z);dummy.scale.set(p.s,p.s*.5,1);dummy.updateMatrix();clouds.setMatrixAt(i,dummy.matrix);}clouds.instanceMatrix.needsUpdate=true;}
 let phase=fixedTime??.47,lighting=skyCycle(phase),lastShadow=new Vector3();const golden=new Color('#ffae65'),daySun=new Color('#fff1dd'),dayFog=new Color('#8cb9d4'),nightFog=new Color('#142540'),warmFog=new Color('#e5af79');
 function update(time:number){phase=fixedTime??(.47+time/DAY_CYCLE_SECONDS)%1;lighting=skyCycle(phase);sun.set(...lighting.sun);quaternion.setFromUnitVectors(SOURCE_SUN,sun).invert();matrix.makeRotationFromQuaternion(quaternion);rotation.setFromMatrix4(matrix);
  moveClouds(time);uniforms.uDay.value=lighting.day;uniforms.uWarmth.value=lighting.warmth;uniforms.uTime.value=time;tint.setRGB(1,.98,.94).lerp(golden,lighting.warmth*GOLDEN_LIGHT.skyTintMix);fogColor.copy(nightFog).lerp(dayFog,lighting.day).lerp(warmFog,lighting.warmth*GOLDEN_LIGHT.fogTintMix);fog.color.copy(fogColor);
  hemisphere.intensity=.11+.14*lighting.day+GOLDEN_LIGHT.hemisphereFill*lighting.warmth;sunlight.intensity=.32+lighting.day*(2.9-lighting.warmth*GOLDEN_LIGHT.sunReduction);sunlight.color.set('#a2bfee').lerp(daySun,lighting.day).lerp(golden,lighting.warmth*GOLDEN_LIGHT.sunTintMix);
  sunlight.position.copy(sun).multiplyScalar(26).add(sunlight.target.position);scene.environmentIntensity=.22+.23*lighting.day+GOLDEN_LIGHT.environmentFill*lighting.warmth;
  const moved=lastShadow.distanceToSquared(sun)>.000025;if(moved){lastShadow.copy(sun);sunlight.shadow.needsUpdate=true;}return moved;
 }
 update(0);return {root,sky,update,get day(){return lighting.day;},get phase(){return phase;},get lighting(){return lighting;},sunlight};
}

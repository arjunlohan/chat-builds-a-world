import {createRealSky} from "./real-sky.js";
import type {SkyLighting} from "../shared/sky-cycle.js";
import {SHADOW_RESOLUTION} from "./render-profile.js";
import type {WorldLook} from "./render-profile.js";
import { indexGeometry } from "./index-geometry.js";
import {
  BackSide, Color, DirectionalLight, FogExp2, Group, HemisphereLight,
  IcosahedronGeometry, InstancedMesh, MathUtils, Mesh,
  Object3D, ShaderMaterial, SphereGeometry, Vector3, type Scene,
} from "three";
import { random } from "./terrain.js";

/** Ten-minute day, authored in linear color; no image textures or external skybox. */
export function createSky(scene: Scene, fixedTime?: number,look:WorldLook="new",shadowSize:number=look==="classic"?SHADOW_RESOLUTION.classic:SHADOW_RESOLUTION.new) {
  if(look!=="classic")return createRealSky(scene,fixedTime,shadowSize);
  const root = new Group();
  const top = new Color(), horizon = new Color(), sunColor = new Color();
  const nightTop = new Color("#13223c"), dayTop = new Color("#286b9b");
  const nightHorizon = new Color("#37475e"), dayHorizon = new Color("#ffc48c"), duskHorizon = new Color("#f59d79");
  const warmSun = new Color("#ffc69b"),moonColor=new Color("#a8c8ec");
  const sunDir = new Vector3(-0.6, 0.35, -0.7).normalize();
  const uniforms = {
    uTop: { value: top }, uHorizon: { value: horizon }, uSunColor: { value: sunColor },
    uSun: { value: sunDir }, uNight: { value: 0 },
  };
  const sky = new Mesh(new SphereGeometry(180, 24, 12), new ShaderMaterial({
    uniforms, side: BackSide, depthWrite: false,
    vertexShader: `varying vec3 vDirection;
      void main(){vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec3 vDirection;
      uniform vec3 uTop,uHorizon,uSunColor,uSun; uniform float uNight;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){
        vec3 dir=normalize(vDirection);
        float h=smoothstep(-0.78,0.42,dir.y);
        vec3 color=mix(uHorizon,uTop,h);
        float sun=dot(dir,uSun);
        color+=uSunColor*(pow(max(sun,0.0),12.0)*0.12+pow(max(sun,0.0),180.0)*0.22+smoothstep(0.9990,0.99965,sun)*2.3);
        vec2 starUV=vec2(atan(dir.z,dir.x),asin(dir.y))*145.0;
        vec2 cell=floor(starUV); float seed=hash(cell);
        float star=(1.0-smoothstep(0.03,0.12,length(fract(starUV)-0.5)))*step(0.988,seed);
        color+=star*uNight*smoothstep(-0.8,0.15,dir.y)*vec3(1.2,1.25,1.4);
        gl_FragColor=vec4(color,1.0);
      }`,
  }));
  sky.name = "painted sky • sun and stars";
  sky.frustumCulled = false;sky.material.userData.emitsBloom=true;
  root.add(sky);

  const hemisphere = new HemisphereLight("#fff0d6", "#586a84", 2);
  const sunlight = new DirectionalLight("#ffe0bb", 3);
  sunlight.position.set(-9, 18, 8);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(shadowSize,shadowSize);
  sunlight.shadow.camera.left = look==="classic"?-15:-13;
  sunlight.shadow.camera.right = look==="classic"?15:13;
  sunlight.shadow.camera.top = look==="classic"?15:13;
  sunlight.shadow.camera.bottom = look==="classic"?-15:-13;
  sunlight.shadow.camera.near = 1;
  sunlight.shadow.camera.far = 60;
  sunlight.shadow.normalBias = 0.035;
  sunlight.shadow.bias = -0.0003;
  sunlight.shadow.radius = 3;
  const fill = new DirectionalLight("#a3d9cf", 0.6);
  fill.position.set(8, 4, -8);
  root.add(hemisphere, sunlight, sunlight.target, fill);
  const fog = new FogExp2(dayHorizon, 0.005);
  scene.fog = fog;

  const cloudUniforms = { uColor: { value: new Color() }, uOpacity: { value: 0.22 } };
  const cloudMaterial = new ShaderMaterial({
    uniforms: cloudUniforms, transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vNormal; varying vec3 vView;
      void main(){vNormal=normalize(normalMatrix*mat3(instanceMatrix)*normal);
      vec4 mv=modelViewMatrix*instanceMatrix*vec4(position,1.0); vView=-mv.xyz;
      gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec3 vNormal; varying vec3 vView;
      void main(){float edge=pow(max(0.0,dot(normalize(vNormal),normalize(vView))),2.0);
      gl_FragColor=vec4(uColor,edge*uOpacity);}`,
  });
  const clouds = new InstancedMesh(indexGeometry(new IcosahedronGeometry(1, 2)), cloudMaterial, 48);
  clouds.name = "low cloud banks";
  const rng = random(199);
  const dummy = new Object3D();
  for (let bank = 0; bank < 12; bank++) {
    const a = rng() * Math.PI * 2, r = 20 + rng() * 18;
    for (let j = 0; j < 4; j++) {
      dummy.position.set(Math.cos(a) * r + (j - 1.5) * 2.5, -10.5 - rng() * 3, Math.sin(a) * r + (rng() - 0.5) * 3);
      dummy.scale.set(2.5 + rng() * 2, 1 + rng() * 0.8, 2 + rng() * 2);
      dummy.rotation.y = a;
      dummy.updateMatrix();
      clouds.setMatrixAt(bank * 4 + j, dummy.matrix);
    }
  }
  clouds.computeBoundingSphere();
  root.add(clouds);
  let phase = 0.34, day = 1, effectiveWarmth=0;
  function update(time: number) {
    phase = fixedTime ?? (0.34 + time / 600) % 1;
    const elevation = Math.sin((phase - 0.25) * Math.PI * 2);
    day = MathUtils.smoothstep(elevation, -0.22, 0.3);
    const warmth = 1 - MathUtils.smoothstep(Math.abs(elevation), 0.05, 0.72);
    effectiveWarmth=warmth*day;
    top.copy(nightTop).lerp(dayTop, day);
    horizon.copy(nightHorizon).lerp(dayHorizon, day).lerp(duskHorizon, warmth * day * 0.65);
    sunColor.set("#ffdbad");
    sunDir.set(-0.6, Math.max(0.12, elevation * 0.6), -0.7).normalize();
    uniforms.uNight.value = 1 - day;
    hemisphere.intensity = look==="classic"?0.7+day*1.1:1.3+day*.5;
    sunlight.intensity = look==="classic"?.15+day*2.8:.55+day*2.4;
    sunlight.color.set("#ffe2bd").lerp(warmSun, warmth * 0.5);if(look!=="classic")sunlight.color.lerp(moonColor,1-day);
    cloudUniforms.uColor.value.copy(horizon);
    cloudUniforms.uOpacity.value = 0.1 + day * 0.12;
    fog.color.copy(horizon);return false;
  }
  update(0);
  return { root, sky, update, get day() { return day; }, get phase() { return phase; }, get lighting():SkyLighting{return {day,warmth:effectiveWarmth,sun:[sunDir.x,sunDir.y,sunDir.z]};}, sunlight };
}

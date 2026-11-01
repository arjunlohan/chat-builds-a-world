import {createRealWater} from "./real-water.js";
import type {WorldLook} from "./render-profile.js";
import {
  AdditiveBlending, BufferGeometry, CircleGeometry, Color, DoubleSide, Float32BufferAttribute,
  Group, Mesh, PlaneGeometry, Points, ShaderMaterial,
} from "three";
import { random } from "./terrain.js";

export function createWater(look:WorldLook="new") {
  if(look!=="classic")return createRealWater();
  const root = new Group();
  root.name = "spring, stream and falling water";
  const uniforms = {
    uTime: { value: 0 }, uDay: { value: 1 },
    uDeep: { value: new Color("#2a7a83") }, uShallow: { value: new Color("#80d6bb") },
  };
  const material = new ShaderMaterial({
    uniforms, side: DoubleSide,
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld;
      void main() {
        vec3 p = position;
        vec4 world = modelMatrix * vec4(p, 1.0);
        world.y += sin(world.x * 2.2 + uTime * 0.7) * cos(world.z * 1.7 - uTime * 0.6) * 0.025;
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uDay;
      uniform vec3 uDeep; uniform vec3 uShallow;
      varying vec3 vWorld;
      void main() {
        vec2 p = vWorld.xz;
        float waves = sin(p.x * 3.8 + p.y * 2.1 + uTime * 0.9) * sin(p.y * 5.2 - p.x * 1.1 - uTime * 0.65);
        float ripple = pow(max(0.0, waves), 9.0);
        float caustic = sin(p.x * 5.0 + sin(p.y * 4.0 + uTime * 0.45)) * cos(p.y * 4.5 + sin(p.x * 3.2 - uTime * 0.3));
        vec3 color = mix(uDeep, uShallow, 0.4 + waves * 0.17 + caustic * 0.12);
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fresnel = pow(1.0 - max(viewDir.y, 0.0), 3.0);
        color = mix(color, vec3(0.68, 0.8, 0.78), fresnel * 0.35);
        color *= mix(0.48, 1.0, uDay);
        color += vec3(0.7, 0.9, 0.72) * ripple * 1.6;
        gl_FragColor = vec4(color, 1.0);
      }`,
  });
  const pool = new Mesh(new CircleGeometry(1, 80), material);
  pool.rotation.x = -Math.PI / 2;
  pool.scale.set(3.5, 2.25, 1);
  pool.position.set(-2.5, 1.13, 1.5);
  root.add(pool);
  const stream = new Mesh(new PlaneGeometry(6.4, 0.72, 20, 2), material);
  stream.rotation.x = -Math.PI / 2;
  stream.rotation.z = -0.045;
  stream.position.set(-8.0, 1.12, 2.2);
  root.add(stream);

  const fallMaterial = new ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: DoubleSide,
    vertexShader: `uniform float uTime; varying vec2 vUv;
      void main(){ vUv = uv; vec3 p=position;
      p.z += sin(uv.y * 10.0 - uTime * 1.5) * 0.04;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
    fragmentShader: `uniform float uTime; uniform float uDay; varying vec2 vUv;
      void main(){
        float edge = smoothstep(0.0,0.13,vUv.x)*smoothstep(1.0,0.85,vUv.x);
        float streak=pow(0.5+0.5*sin(vUv.x*72.0+sin(vUv.y*13.0+uTime*2.5)),5.0);
        float flow=0.65+0.35*sin(vUv.y*45.0+uTime*5.0);
        vec3 c=mix(vec3(0.19,0.56,0.57),vec3(0.7,0.96,0.85),streak*flow);
        gl_FragColor=vec4(c*mix(0.6,1.25,uDay),edge*(0.65+streak*0.3)*smoothstep(0.0,0.13,vUv.y));
      }`,
  });
  const fall = new Mesh(new PlaneGeometry(0.78, 6, 2, 20), fallMaterial);
  fall.position.set(-11.0, -1.8, 2.32);
  fall.rotation.y = -Math.PI / 2;
  root.add(fall);
  return { root, update(time: number, day: number) { uniforms.uTime.value = time; uniforms.uDay.value = day; } };
}

export function createMotes() {
  const rng = random(41), positions: number[] = [], phases: number[] = [];
  for (let i = 0; i < 120; i++) {
    positions.push((rng() - 0.5) * 17, 2.2 + rng() * 4.5, (rng() - 0.5) * 13);
    phases.push(rng() * Math.PI * 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aPhase", new Float32BufferAttribute(phases, 1));
  const uniforms = { uTime: { value: 0 }, uNight: { value: 0 } };
  const material = new ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: `uniform float uTime; attribute float aPhase; varying float vGlow;
      void main(){
        vec3 p=position+vec3(sin(uTime*0.2+aPhase)*0.4,sin(uTime*0.35+aPhase)*0.3,cos(uTime*0.25+aPhase)*0.35);
        vec4 mv=modelViewMatrix*vec4(p,1.0);
        gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(100.0/-mv.z,1.5,7.0);
        vGlow=0.35+0.65*pow(0.5+0.5*sin(uTime*0.8+aPhase),2.0);
      }`,
    fragmentShader: `uniform float uNight; varying float vGlow;
      void main(){ float r=length(gl_PointCoord-0.5)*2.0; if(r>1.0) discard;
      gl_FragColor=vec4(vec3(1.8,1.35,0.65),pow(1.0-r,2.0)*vGlow*(0.45+uNight*0.55)); }`,
  });
  const root = new Points(geometry, material);
  root.name = "120 fireflies • GPU animation";
  return { root, update(time: number, night: number) { uniforms.uTime.value = time; uniforms.uNight.value = night; } };
}

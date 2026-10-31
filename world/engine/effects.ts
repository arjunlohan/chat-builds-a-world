import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial } from "three";
import type { WorldServices } from "./api.js";
import { random } from "./terrain.js";

/** Fixed pool, reserved in the world ledger; each request reuses a free slot. */
export function createEffects() {
  const capacity = 96;
  const positions = new Float32Array(capacity * 3), velocities = new Float32Array(capacity * 3);
  const births = new Float32Array(capacity).fill(-100);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aVelocity", new Float32BufferAttribute(velocities, 3));
  geometry.setAttribute("aBorn", new Float32BufferAttribute(births, 1));
  const uniforms = { uTime: { value: 0 } };
  const material = new ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: `uniform float uTime; attribute vec3 aVelocity; attribute float aBorn; varying float vAlpha;
      void main(){float age=uTime-aBorn; vAlpha=step(0.0,age)*(1.0-smoothstep(0.5,1.8,age));
      vec3 p=position+aVelocity*max(age,0.0); p.y-=age*age*0.12;
      vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv;
      gl_PointSize=clamp(120.0/-mv.z,1.0,8.0)*vAlpha;}`,
    fragmentShader: `varying float vAlpha;
      void main(){float r=length(gl_PointCoord-0.5)*2.0; if(r>1.0)discard;
      gl_FragColor=vec4(1.8,1.5,0.8,vAlpha*pow(1.0-r,2.0));}`,
  });
  const root = new Points(geometry, material);
  root.frustumCulled = false;
  root.name = "effect pool • 96 reserved particles";
  const rng = random(301);
  const play: WorldServices["effects"]["play"] = (name, target) => {
    let remaining = name === "portal" ? 32 : name === "sparkle" ? 4 : 16;
    for (let i = 0; i < capacity && remaining > 0; i++) {
      if (uniforms.uTime.value - births[i]! < 1.8) continue;
      births[i] = uniforms.uTime.value;
      positions.set([target.x, target.y, target.z], i * 3);
      velocities.set([(rng() - 0.5) * 1.6, 0.5 + rng() * 1.2, (rng() - 0.5) * 1.6], i * 3);
      remaining--;
    }
    for (const attribute of Object.values(geometry.attributes)) attribute.needsUpdate = true;
  };
  return { root, play, update(time: number) { uniforms.uTime.value = time; } };
}

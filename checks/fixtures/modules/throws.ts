import type { WorldModule } from "../../../world/engine/api.js";
import { Mesh, IcosahedronGeometry, MeshStandardMaterial } from "three";
export default (): WorldModule => {
  let mesh: Mesh, time = 0;
  return {
    id: "FIXTURE_ID",
    init(services) { mesh = new Mesh(new IcosahedronGeometry(1.1, 0), new MeshStandardMaterial({ color: "#f3b66c", emissive: "#593b14", emissiveIntensity: 0.4 })); mesh.position.set(0, 4, 0); services.scene.add(mesh); },
    update(_dt) { throw new Error("fixture update failure"); },
    onChat() {}, onCitizenSpawn() {}, onRaid() {},
    dispose() { mesh.geometry.dispose(); (mesh.material as MeshStandardMaterial).dispose(); mesh.removeFromParent(); },
  };
};

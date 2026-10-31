import type { WorldModuleFactory } from "../engine/api.js";

/** Inert contract example; not loaded by the Phase 1 placeholder. */
const createModule: WorldModuleFactory = () => ({
  id: "example",
  init(_services) {},
  update(_dt) {},
  onChat(_event) {},
  onCitizenSpawn(_citizen) {},
  onRaid(_event) {},
  dispose() {},
});

export default createModule;

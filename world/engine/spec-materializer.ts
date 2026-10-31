import type { WorldServices } from "./api.js";

/** TODO: revalidate and atomically allocate capped, engine-owned resources. */
export const spawnSpec: WorldServices["spawnSpec"] = () => {
  throw new Error("Scene Spec materializer is not implemented in Phase 1");
};

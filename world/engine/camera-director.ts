import type { WorldServices } from "./api.js";

/** TODO: cinematic drift, bounded priority queue and focus interpolation. */
export const focus: WorldServices["camera"]["focus"] = () => {
  throw new Error("Camera director is not implemented in Phase 1");
};

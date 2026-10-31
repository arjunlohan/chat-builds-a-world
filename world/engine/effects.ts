import type { WorldServices } from "./api.js";

/** TODO: pooled spawn/portal/sparkle effects under the shared particle budget. */
export const effects: WorldServices["effects"] = {
  play() { throw new Error("Effects are not implemented in Phase 1"); },
};

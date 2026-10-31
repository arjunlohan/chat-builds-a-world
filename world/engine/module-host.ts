import type { WorldModuleFactory } from "./api.js";

export const MODULE_BUDGET = Object.freeze({
  maxActive: 8, perModuleMs: 2, totalMs: 4, maxDtSeconds: 0.05,
  overrunWindow: 60, disableAfterOverruns: 3,
});

/** TODO: hook isolation, timing, auto-disable, resource ownership and hot swap. */
export function loadModule(_factory: WorldModuleFactory): void {
  throw new Error("Module host is not implemented in Phase 1");
}

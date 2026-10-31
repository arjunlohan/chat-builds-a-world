import type { WorldServices } from "./api.js";

/** TODO: bounded host log ring and overlay feed; never log raw secrets/chat. */
export const log: WorldServices["log"] = (level, message) => {
  console[level](`[world] ${message.slice(0, 512)}`);
};

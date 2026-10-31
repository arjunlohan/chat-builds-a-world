import type { RoundState } from "../server/rounds/types.js";
import { cached, el, heading, panel } from "./dom.js";
export function timeline() {
  const root = panel("Version timeline", "timeline-panel"), list = el("ol", "timeline");
  root.append(heading("MADE HERE, TOGETHER", "The world so far"), list);
  const draw = cached<RoundState["timeline"]>(list, value => value.length ? value.slice(-2).reverse().map(version => {
    const row = el("li", `version ${version.kind}`); row.dataset.kind = version.kind;
    const copy = el("div"); copy.append(el("p", "version-title", version.title), el("p", "credit", version.requester));
    row.append(el("span", "version-tag", version.kind === "ship" ? `v${version.version}` : `↶ v${version.version}`), copy, el("span", "version-status", version.kind === "ship" ? "STUB" : "KEPT"));
    row.title = version.reason; return row;
  }) : [el("li", "empty", "Every chapter will carry its maker’s name. Stub ships appear here until the runner is connected.")]);
  return { root, update(state: RoundState) { draw(state.timeline); } };
}

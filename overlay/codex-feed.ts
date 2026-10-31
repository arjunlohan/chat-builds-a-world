import type { RoundState } from "../server/rounds/types.js";
import { cached, el, heading, panel } from "./dom.js";
export function codexFeed() {
  const root = panel("Codex build feed", "feed-panel"), header = heading("", "Build");
  const badge = el("span", "badge", "STUB RUNNER"), title = el("p", "build-idea"), credit = el("p", "credit");
  const track = el("div", "progress-track"), fill = el("div", "progress-fill"), percent = el("span", "progress-number", "0%");
  track.append(fill); const progress = el("div", "build-progress"); progress.append(track, percent);
  const lines = el("ol", "feed-lines"); root.append(header, badge, title, credit, progress, lines);
  root.hidden = true;
  const draw = cached<RoundState["build"]["lines"]>(lines, value => value.slice(-3).map(line => {
    const row = el("li", `feed-line ${line.kind}`); row.append(el("span", "feed-kind", line.kind.toUpperCase()), el("span", "feed-text", line.text)); return row;
  }));
  return { root, update(state: RoundState) {
    const build = state.build;
    root.hidden = build.status === "idle" || (state.phase !== "building" && state.phase !== "guarding");
    header.querySelector("h2")!.textContent = build.status === "reviewing" ? "Guard review" : "Codex is building";
    root.dataset.status = build.status;
    badge.textContent = build.status === "reviewing" ? (state.guard.mode === "fixture" ? "FIXTURE GUARD" : "READ-ONLY GUARD") : (state.guard.mode === "fixture" ? "FIXTURE · STUB RUNNER" : "STUB RUNNER");
    title.textContent = build.idea;
    credit.textContent = build.requester ? `by ${build.requester}` : "";
    fill.style.transform = `scaleX(${build.progress / 100})`; percent.textContent = `${build.progress}%`;
    progress.hidden = build.status === "idle" || build.status === "reviewing"; draw(build.lines);
  } };
}

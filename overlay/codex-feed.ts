import type { RoundState } from "../server/rounds/types.js";
import { cached, el, heading, panel } from "./dom.js";
export function codexFeed() {
  const root = panel("Codex build feed", "feed-panel"), header = heading("FROM CHAT TO A LITTLE WONDER", "Waiting for chat’s next idea");
  const badge = el("span", "badge", "STUB RUNNER"), title = el("p", "build-idea"), credit = el("p", "credit");
  const track = el("div", "progress-track"), fill = el("div", "progress-fill"), percent = el("span", "progress-number", "0%");
  track.append(fill); const progress = el("div", "build-progress"); progress.append(track, percent);
  const lines = el("ol", "feed-lines"); root.append(header, badge, title, credit, progress, lines);
  const draw = cached<RoundState["build"]["lines"]>(lines, value => value.slice(-3).map(line => {
    const row = el("li", `feed-line ${line.kind}`); row.append(el("span", "feed-kind", line.kind.toUpperCase()), el("span", "feed-text", line.text)); return row;
  }));
  return { root, update(state: RoundState) {
    const build = state.build;
    header.querySelector("h2")!.textContent = build.status === "running" ? "Codex is building" : build.status === "idle" ? "The next chapter starts here" : "Last stub build";
    root.dataset.status = build.status;
    title.textContent = build.idea || "One idea. One community. A world that keeps growing.";
    credit.textContent = build.requester ? `Requested by ${build.requester}` : "Plans and edits will appear here during the build.";
    fill.style.transform = `scaleX(${build.progress / 100})`; percent.textContent = `${build.progress}%`;
    progress.hidden = build.status === "idle"; draw(build.lines);
  } };
}

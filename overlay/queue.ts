import type { RoundState } from "../server/rounds/types.js";
import { cached, el, heading, panel } from "./dom.js";
export function queue() {
  const root = panel("Idea queue", "idea-panel");
  const list = el("ol", "ideas"); root.append(heading("", "Ideas"), list);
  root.hidden = true;
  const draw = cached<Pick<RoundState, "ideas" | "totalIdeas">>(list, state => {
    if (!state.ideas.length) return [];
    return state.ideas.slice(0, 4).map((idea, i) => {
      const row = el("li", "idea"); row.dataset.ideaId = idea.id;
      const title = el("p", "idea-title", idea.text), credit = el("p", "credit", `${idea.requester} · ${idea.supporters} ${idea.supporters === 1 ? "backer" : "backers"}`);
      const copy = el("div"); copy.append(title, credit); row.append(el("span", "idea-number", String(i + 1).padStart(2, "0")), copy); return row;
    });
  });
  return { root, update(state: RoundState) { root.querySelector("h2")!.textContent = `Ideas · ${state.totalIdeas}`; root.hidden = state.phase !== "ideas" || !state.ideas.length; draw({ ideas: state.ideas, totalIdeas: state.totalIdeas }); } };
}

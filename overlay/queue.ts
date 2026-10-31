import type { RoundState } from "../server/rounds/types.js";
import { cached, el, heading, panel } from "./dom.js";
export function queue() {
  const root = panel("Idea queue", "idea-panel");
  const list = el("ol", "ideas"); root.append(heading("A LITTLE WISH, A BIG POSSIBILITY", "What should we build?"), list);
  const draw = cached<Pick<RoundState, "ideas" | "totalIdeas">>(list, state => {
    if (!state.ideas.length) return [el("li", "empty", "Dream up something for the island. Your next little idea could become part of the world.")];
    return state.ideas.slice(0, 4).map((idea, i) => {
      const row = el("li", "idea"); row.dataset.ideaId = idea.id;
      const title = el("p", "idea-title", idea.text), credit = el("p", "credit", `${idea.requester} · ${idea.supporters} ${idea.supporters === 1 ? "backer" : "backers"}`);
      const copy = el("div"); copy.append(title, credit); row.append(el("span", "idea-number", String(i + 1).padStart(2, "0")), copy); return row;
    });
  });
  return { root, update(state: RoundState) { root.hidden = state.phase !== "ideas"; draw({ ideas: state.ideas, totalIdeas: state.totalIdeas }); } };
}

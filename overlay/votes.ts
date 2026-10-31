import type { RoundState } from "../server/rounds/types.js";
import { el, heading, panel } from "./dom.js";
export function votes() {
  const root = panel("Live votes", "vote-panel"), list = el("ol", "vote-options"), total = el("p", "vote-total");
  root.append(heading("THREE WISHES. ONE NEXT CHAPTER.", "Chat, choose the next build."), list, total);
  const cards = new Map<string, { row: HTMLElement; count: HTMLElement; fill: HTMLElement; title: HTMLElement; credit: HTMLElement }>();
  return { root, update(state: RoundState) {
    root.hidden = state.phase === "ideas";
    const present = new Set(state.candidates.map(c => c.id));
    for (const [id, card] of cards) if (!present.has(id)) { card.row.remove(); cards.delete(id); }
    for (const option of state.candidates) {
      let card = cards.get(option.id);
      if (!card) {
        const row = el("li", "vote-option"), fill = el("div", "vote-fill"), content = el("div", "vote-content");
        const title = el("p", "vote-title"), credit = el("p", "credit"), count = el("span", "vote-count");
        const copy = el("div", "vote-copy"); copy.append(title, credit);
        content.append(el("span", "vote-slot", String(option.slot)), copy, count); row.append(fill, content); list.append(row);
        row.dataset.slot = String(option.slot); card = { row, fill, title, credit, count }; cards.set(option.id, card);
      }
      card.title.textContent = option.text; card.credit.textContent = option.requester; card.count.textContent = String(option.votes);
      card.fill.style.transform = `scaleX(${state.totalVotes ? option.votes / state.totalVotes : 0})`;
      card.row.setAttribute("aria-label", `Option ${option.slot}: ${option.text}, ${option.votes} votes`);
      card.row.classList.toggle("winner", state.winner?.id === option.id);
    }
    total.textContent = `${state.totalVotes} ${state.totalVotes === 1 ? "voter" : "voters"} · ${state.phase === "building" ? "VOTING CLOSED" : "Your latest vote counts"}`;
  } };
}

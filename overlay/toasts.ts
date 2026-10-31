import type { ToastView } from "../server/rounds/types.js";
import { cached, el } from "./dom.js";
const labels: Record<ToastView["kind"], string> = { summon: "SUMMON", citizens: "CITIZENS", ship: "SHIP", revert: "REVERT", notice: "NOTICE" };
export function toasts() {
  const root = el("aside", "toasts"); root.setAttribute("aria-live", "polite"); root.setAttribute("aria-label", "World moments");
  const draw = cached<ToastView[]>(root, value => value.slice(-2).map(toast => {
    const card = el("article", `toast ${toast.kind}`); card.dataset.toastId = String(toast.id);
    card.append(el("p", "eyebrow", labels[toast.kind]), el("h3", "", toast.title), el("p", "toast-detail", toast.detail)); return card;
  }));
  return { root, update: draw };
}

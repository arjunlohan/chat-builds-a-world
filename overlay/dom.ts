export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
}
export function panel(label: string, extra = "") {
  const node = el("section", `panel ${extra}`); node.setAttribute("aria-label", label); return node;
}
export function heading(kicker: string, title: string) {
  const node = el("header", "panel-heading"); node.append(el("p", "eyebrow", kicker), el("h2", "", title)); return node;
}
export function cached<T>(root: HTMLElement, draw: (value: T) => Node[]) {
  let last = "";
  return (value: T) => { const key = JSON.stringify(value); if (key === last) return; last = key; root.replaceChildren(...draw(value)); };
}

import { Vector3, type PerspectiveCamera } from "three";

export interface LabelCandidate {
  id: string; x: number; y: number; width: number; height: number;
  priority: number; kind: "speech" | "tag" | "quiet" | "summon"; opacity: number;
}
const projected = new Vector3();
/** Shared fixed-OBS projection; callers keep their single pooled label candidate. */
export function projectLabel(point: Readonly<Vector3>, camera: PerspectiveCamera, target: {x:number;y:number}, lift=0) {
  projected.copy(point);projected.y+=lift;projected.project(camera);
  if(Math.abs(projected.z)>=1)return false;target.x=(projected.x+1)*960;target.y=(1-projected.y)*540;return true;
}
export interface Rect { x: number; y: number; width: number; height: number }
const intersects = (a: Rect, b: Rect) => a.x < b.x + b.width + 5 && a.x + a.width + 5 > b.x && a.y < b.y + b.height + 5 && a.y + a.height + 5 > b.y;
const reserved: Rect[] = [
  { x: 0, y: 0, width: 470, height: 130 }, { x: 0, y: 880, width: 570, height: 200 },
  { x: 1530, y: 950, width: 390, height: 130 }, { x: 1650, y: 0, width: 270, height: 115 },
];
/** Stable greedy decluttering. Speech reserves its entire bubble + name footprint first. */
export function packLabels(candidates: readonly LabelCandidate[]) {
  const occupied = [...reserved], chosen = new Set<string>();
  let speech = 0, full = 0, quiet = 0;
  const ordered = [...candidates].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  for (const c of ordered) {
    if (c.opacity <= 0 || ![c.x, c.y, c.width, c.height].every(Number.isFinite)) continue;
    if ((c.kind === "speech" && speech >= 8) || (c.kind === "quiet" && quiet >= 6) || (c.kind !== "quiet" && full >= 22)) continue;
    const rect = { x: c.x - c.width / 2, y: c.y - c.height, width: c.width, height: c.height };
    if (rect.x < 20 || rect.y < 20 || rect.x + rect.width > 1900 || rect.y + rect.height > 1060 || occupied.some(o => intersects(rect, o))) continue;
    occupied.push(rect); chosen.add(c.id);
    if (c.kind === "speech") speech++;
    if (c.kind === "quiet") quiet++; else full++;
  }
  return chosen;
}
export function citizenLabelMode(distance: number, spokeAge: number, arrivedAge: number, focused: boolean) {
  return distance < 19 || spokeAge < 30_000 || arrivedAge < 8000 || focused ? "tag" : "quiet";
}
type Describe = (candidate: LabelCandidate, now: number, camera: PerspectiveCamera, focus: Readonly<Vector3> | undefined) => boolean | undefined;
export class LabelManager {
  private readonly entries = new Map<string, { element: HTMLElement; describe: Describe; candidate: LabelCandidate; transform: string; width: string; opacity: string }>();
  private visible = new Set<string>();
  private last = -Infinity;
  add(id: string, element: HTMLElement, describe: Describe) {
    this.entries.set(id, { element, describe, transform: "", width: "", opacity: "", candidate: {id,x:0,y:0,width:0,height:0,priority:0,kind:"quiet",opacity:0} });
    return () => { this.entries.delete(id); this.visible.delete(id); element.remove(); };
  }
  update(now: number, camera: PerspectiveCamera, focus?: Readonly<Vector3>) {
    if (now - this.last < 50) return;
    this.last = now;
    const candidates: LabelCandidate[] = [];
    for (const entry of this.entries.values()) if (entry.describe(entry.candidate, now, camera, focus)) candidates.push(entry.candidate);
    const chosen = packLabels(candidates);
    for (const id of this.visible) if (!chosen.has(id)) { const element=this.entries.get(id)?.element;if(element) element.hidden=true; }
    for (const c of candidates) if (chosen.has(c.id)) {
      const entry=this.entries.get(c.id)!,element=entry.element;
      if (!this.visible.has(c.id)) element.hidden = false;
      if (element.dataset.mode !== c.kind) element.dataset.mode = c.kind;
      const width=`${c.width}px`, transform=`translate3d(${c.x.toFixed(1)}px,${c.y.toFixed(1)}px,0) translate(-50%,-100%)`, opacity=String(c.opacity);
      if(entry.width!==width)element.style.width=entry.width=width;
      if(entry.transform!==transform)element.style.transform=entry.transform=transform;
      if(entry.opacity!==opacity)element.style.opacity=entry.opacity=opacity;
    }
    this.visible=chosen;
  }
  dispose() { for (const entry of this.entries.values()) entry.element.remove(); this.entries.clear(); }
}

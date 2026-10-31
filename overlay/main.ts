import "./style.css";
import type { WorldEvent } from "../server/contracts.js";
import type { RoundState } from "../server/rounds/types.js";
import { el, panel } from "./dom.js";
import { queue } from "./queue.js";
import { votes } from "./votes.js";
import { codexFeed } from "./codex-feed.js";
import { timeline } from "./timeline.js";
import { toasts } from "./toasts.js";
const root = document.querySelector<HTMLElement>("#overlay")!;
const phase = panel("Current round", "phase-panel");
const kicker = el("p", "eyebrow", "CHAT BUILDS A WORLD"), title = el("h1", "phase-title", "Finding the garden…"), countdown = el("output", "countdown", "—:——");
const command = el("p", "command", "Connecting to the local world"), mode = el("span", "mode", "LIVE"), connection = el("p", "connection", "CONNECTING");
const phaseCopy = el("div", "phase-copy"); phaseCopy.append(kicker, title, command); phase.append(phaseCopy, countdown, mode, connection);
const ideaQueue = queue(), voteBars = votes(), feed = codexFeed(), history = timeline(), moments = toasts();
root.append(phase, ideaQueue.root, voteBars.root, feed.root, history.root, moments.root);
let state: RoundState | null = null, received = 0, toastKey = "";
function update(value: RoundState) {
  state = value; received = performance.now();
  title.textContent = value.paused ? "The garden is paused" : value.phase === "ideas" ? `Round ${value.round} · Dream it up` : value.phase === "voting" ? "Choose our next chapter" : "A wish is taking shape";
  command.textContent = value.paused ? "A moderator will resume the round" : value.phase === "ideas" ? "!idea your little wish" : value.phase === "voting" ? "!vote 1 · !vote 2 · !vote 3" : "Building the winning idea";
  mode.textContent = value.simulation ? `REHEARSAL · ${value.clockRate}×` : "LIVE ROUNDS";
  phase.dataset.phase = value.phase;
  ideaQueue.update(value); voteBars.update(value); feed.update(value); history.update(value); clock();
}
function clock() {
  if (!state) return;
  const elapsed = performance.now() - received;
  const seconds = Math.max(0, Math.ceil((state.endsAt - state.now - (state.paused ? 0 : elapsed * state.clockRate)) / 1000));
  countdown.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const active = state.toasts.filter(t => t.expiresAt > state!.realNow + elapsed);
  const key = active.map(t => t.id).join(); if (key !== toastKey) { toastKey = key; moments.update(active); }
}
function resize() { root.style.transform = `scale(${Math.min(innerWidth / 1920, innerHeight / 1080)})`; }
resize(); window.addEventListener("resize", resize);
const events = new EventSource("/events");
events.onopen = () => { connection.textContent = "CONNECTED"; connection.classList.add("connected"); };
events.onerror = () => { connection.textContent = "RECONNECTING"; connection.classList.remove("connected"); };
events.onmessage = message => {
  try {
    const event = JSON.parse(message.data) as WorldEvent;
    if (event.type === "snapshot" && event.rounds) update(event.rounds);
    if (event.type === "rounds") update(event.state);
  } catch { connection.textContent = "WAITING FOR WORLD STATE"; }
};
const timer = setInterval(clock, 100);
window.addEventListener("pagehide", () => { clearInterval(timer); events.close(); }, { once: true });

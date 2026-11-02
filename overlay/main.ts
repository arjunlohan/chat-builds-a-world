import {captureUrl} from "../world/engine/capture.js";
import {reactionOverlay} from "./reactions.js";
import "./style.css";
import type { WorldEvent } from "../server/contracts.js";
import type { RoundState } from "../server/rounds/types.js";
import { el, panel } from "./dom.js";
import { queue } from "./queue.js";
import { votes } from "./votes.js";
import { codexFeed } from "./codex-feed.js";
import { timeline } from "./timeline.js";
import { toasts } from "./toasts.js";
const query=new URLSearchParams(location.search),capturing=query.get("capture")==="1";let virtualNow=0,captureFrame=0;const now=()=>capturing?virtualNow:performance.now();document.body.classList.toggle("frame-capture",capturing);
const root = document.querySelector<HTMLElement>("#overlay")!;
const phase = panel("Current round", "phase-panel");
const kicker = el("p", "eyebrow", "ROUND"), title = el("h1", "phase-title", "Connecting"), countdown = el("output", "countdown", "--:--");
const command = el("p", "command", "Waiting for state"), mode = el("span", "mode", "LIVE"), connection = el("p", "connection", "CONNECTING");
const phaseCopy = el("div", "phase-copy"); phaseCopy.append(kicker, title, command); phase.append(phaseCopy, countdown, mode, connection);
const ideaQueue = queue(), voteBars = votes(), feed = codexFeed(), history = timeline(), moments = toasts();
const left = el("div", "rail left-rail"), right = el("div", "rail right-rail");
const reactions=reactionOverlay(capturing?{now,frameExact:true}:{});
const twitchNotice=el("p","twitch-notice","Twitch chat disconnected: check the server log");twitchNotice.hidden=true;twitchNotice.setAttribute("role","status");
left.append(twitchNotice,phase, ideaQueue.root, voteBars.root, reactions.root); right.append(feed.root, history.root);
root.append(left, right, moments.root,reactions.video);
let phaseAnimation: Animation|undefined;
let state: RoundState | null = null, received = 0, toastKey = "";
function update(value: RoundState) {
  const changed=!!state && (state.phase!==value.phase || state.paused!==value.paused);
  if(changed&&!matchMedia("(prefers-reduced-motion: reduce)").matches){
    const opacity=getComputedStyle(phaseCopy).opacity,transform=getComputedStyle(phaseCopy).transform;phaseAnimation?.cancel();
    phaseAnimation=phaseCopy.animate([{opacity:Math.min(Number(opacity),.65),transform:transform==="none"?"translateY(5px)":transform},{opacity:1,transform:"translateY(0)"}],{duration:200,easing:"cubic-bezier(.05,.7,.1,1)"});
  }
  state = value; received = now();
  title.textContent = value.paused ? "Paused" : value.phase === "ideas" ? "Ideas" : value.phase === "voting" ? "Vote" : value.phase === "rollback" ? "Rollback vote" : value.phase === "guarding" ? "Guard review" : "Build";
  command.textContent = value.paused ? "Awaiting moderator" : value.phase === "ideas" ? "!idea <wish>" : value.phase === "voting" ? "!vote 1|2|3" : value.phase === "rollback" ? "!vote yes|no" : value.phase === "guarding" ? "Safety + scope check" : "Codex runner";
  kicker.textContent = `ROUND ${value.round}`;
  mode.textContent = value.simulation ? `REHEARSAL · ${value.clockRate}×` : "LIVE ROUNDS";
  if (value.phase === "rollback" && value.rollback) command.textContent = `!vote yes|no · ${value.rollback.yes}–${value.rollback.no}`;
  phase.dataset.phase = value.phase;
  ideaQueue.update(value); voteBars.update(value); feed.update(value); history.update(value); clock();
}
function clock() {
  reactions.clock();
  if (!state) return;
  const elapsed = now() - received;
  const seconds = Math.max(0, Math.ceil((state.endsAt - state.now - (state.paused ? 0 : elapsed * state.clockRate)) / 1000));
  countdown.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const active = state.toasts.filter(t => t.expiresAt > state!.realNow + elapsed);
  const key = active.map(t => t.id).join(); if (key !== toastKey) { toastKey = key; moments.update(active); }
}
function resize() { root.style.transform = `scale(${Math.min(innerWidth / 1920, innerHeight / 1080)})`; }
resize(); window.addEventListener("resize", resize);
let events:EventSource|undefined;
if(!capturing){events = new EventSource("/events");
events.onopen = () => { connection.textContent = "CONNECTED"; connection.classList.add("connected"); };
events.onerror = () => { connection.textContent = "RECONNECTING"; connection.classList.remove("connected"); };
events.onmessage = message => {
  try {
    const event = JSON.parse(message.data) as WorldEvent;
    if (event.type === "snapshot") {if(event.rounds)update(event.rounds);if(event.reactions)reactions.update(event.reactions);twitchNotice.hidden=event.twitch!=="disconnected";}
    if(event.type==="twitch")twitchNotice.hidden=event.status!=="disconnected";
    if(event.type==="reactions")reactions.update(event.state);
    if (event.type === "rounds") update(event.state);
  } catch { connection.textContent = "WAITING FOR WORLD STATE"; }
};
}
const timer = capturing?undefined:setInterval(clock, 100);
if(capturing){const ready=(async()=>{const response=await fetch(captureUrl(query));if(!response.ok)throw new Error("Saved capture unavailable");const event=await response.json() as Extract<WorldEvent,{type:"snapshot"}>;if(event.rounds)update(event.rounds);if(event.reactions)reactions.update(event.reactions);connection.classList.add("connected");await reactions.renderFrame();})();window.__capture={ready,get frame(){return captureFrame;},get time(){return virtualNow/1000;},async step(dt){await ready;if(!Number.isFinite(dt)||dt<0||dt>.05)throw new Error("Capture dt must be 0..0.05 seconds");virtualNow+=dt*1000;captureFrame++;clock();await reactions.renderFrame();}};}
window.addEventListener("pagehide", () => { clearInterval(timer); events?.close(); reactions.dispose(); }, { once: true });

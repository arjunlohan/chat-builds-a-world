import {captureQuery,frameCapture} from "./engine/capture.js";
import { pageProfile, documentLook } from "./engine/render-profile.js";
import "./style.css";
import { createRenderer } from "./engine/renderer.js";
import type { WorldStats } from "./engine/stats.js";

declare global { interface Window { __worldStats: WorldStats; __worldFrameTrace?: import("./engine/stats.js").FrameTrace } }

const canvas = document.querySelector<HTMLCanvasElement>("#world");
const status = document.querySelector<HTMLElement>("#status");
const fps = document.querySelector<HTMLOutputElement>("#fps");
const clock = document.querySelector<HTMLElement>("#time-of-day");
const fault = document.querySelector<HTMLElement>("#module-status");
const labels = document.querySelector<HTMLElement>("#citizen-labels");
const count = document.querySelector<HTMLElement>("#citizen-count");
const connection = document.querySelector<HTMLElement>("#connection-status");
const query = new URLSearchParams(location.search);
const capturing=query.get("capture")==="1";document.body.classList.toggle("frame-capture",capturing);
document.body.classList.toggle("overlay-active", query.get("overlay") === "1");
if (fps) fps.hidden = query.get("debug") !== "1";
const phases: Record<string, number> = { dawn: 0.25, day: 0.5, dusk: 0.75, night: 0 };
const phase = phases[query.get("time") ?? ""];
function fail(message: string) {
  if (status) { status.hidden = false; status.textContent = message; status.classList.add("error"); }
}
try {
  if (!canvas) throw new Error("World canvas is missing");
  const world = createRenderer(canvas, {
    profile: pageProfile(query,documentLook()),
    ...(capturing?{capture:captureQuery(query),playback:true}:{}),
    probeId: query.get("probe") ?? "",
    ...(labels ? { labels } : {}),
    onReply(message) { if (fault) { fault.hidden = false; fault.textContent = message; } },
    onConnection(connected) { if (connection) connection.hidden = connected; },
    ...(phase !== undefined ? { fixedTime: phase } : {}),
    onReady() { if (status) status.hidden = true; canvas.dataset.ready = "true"; },
    onError: fail,
    onFrame(instant, average, time, citizens) {
      if (count) count.textContent = `${citizens} ${citizens === 1 ? "NEIGHBOR" : "NEIGHBORS"}`;
      if (fps && !fps.hidden) fps.textContent = `${instant.toFixed(0)} FPS · ${average.toFixed(1)} AVG`;
      if (clock) clock.textContent = time < 0.24 || time > 0.8 ? "AFTER THE STARS" : time < 0.3 ? "FIRST LIGHT" : time < 0.4 ? "THE GOLDEN HOURS" : time < 0.65 ? "DAYLIGHT" : "EVENING GLOW";
    },
    onStatus(event) {
      if (!fault) return;
      if (event.state === "disabled" || event.state === "rejected") {
        fault.hidden = false;
        fault.textContent = `${event.id} · ${event.reason}`;
      }
    },
  });
  if(capturing){window.__capture=frameCapture(world,query);void window.__capture.ready.catch(()=>fail("The saved capture could not load."));}
  window.addEventListener("pagehide", () => world.dispose(), { once: true });
} catch {
  fail("This world needs WebGL 2. Enable graphics acceleration, then reload.");
}

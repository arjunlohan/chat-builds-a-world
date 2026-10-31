import "./style.css";
import { createRenderer } from "./engine/renderer.js";

const canvas = document.querySelector<HTMLCanvasElement>("#world");
const status = document.querySelector<HTMLElement>("#status");
try {
  if (!canvas) throw new Error("World canvas is missing");
  const world = createRenderer(canvas);
  if (status) status.textContent = "Three.js ready · offline scaffold";
  window.addEventListener("pagehide", () => world.dispose(), { once: true });
} catch (error) {
  if (status) status.textContent = "Placeholder ready · WebGL unavailable in this browser";
  console.error(error);
}

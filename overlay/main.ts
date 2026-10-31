import "../world/style.css";
import { queue } from "./queue.js";
import { votes } from "./votes.js";
import { codexFeed } from "./codex-feed.js";
import { timeline } from "./timeline.js";
import { toasts } from "./toasts.js";

const root = document.querySelector("#overlay");
for (const text of [queue(), votes(), codexFeed(), timeline(), toasts()]) {
  const line = document.createElement("p");
  line.textContent = text;
  root?.append(line);
}

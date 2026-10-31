import type { WorldEvent } from "../../server/contracts.js";

/** EventSource reconnects automatically; every new connection begins with a full snapshot. */
export function connectWorld(onEvent: (event: WorldEvent) => void, onConnection: (connected: boolean) => void, clientId?: string) {
  const stream = new EventSource(clientId ? `/events?world=${encodeURIComponent(clientId)}` : "/events");
  let revision = -1;
  stream.onopen = () => onConnection(true);
  stream.onerror = () => onConnection(false);
  stream.onmessage = event => {
    let message: WorldEvent;
    try { message = JSON.parse(event.data) as WorldEvent; } catch { return; }
    if (!message || typeof message.revision !== "number") return;
    if (message.type === "snapshot") revision = message.revision;
    else { if (message.revision <= revision) return; revision = message.revision; }
    onEvent(message);
  };
  return () => stream.close();
}

import WebSocket from "ws";
import type { ChatEvent, RaidEvent } from "../contracts.js";
import { TwitchAuth, TwitchError, tokenStore, type TokenStore, type TwitchConfig } from "./auth.js";
import { incomingRaid } from "./raid.js";
import { parseChat } from "../pipeline.js";

export const EVENTSUB_URL = "wss://eventsub.wss.twitch.tv/ws";
export interface TwitchHandlers {
  onChat(event: ChatEvent, authority: { moderator: boolean }): void;
  onRaid(event: RaidEvent): void;
}
type Timer = ReturnType<typeof setTimeout>;
export interface TwitchOptions {
  fetch?: typeof fetch; socket?: (url: string) => WebSocket; store?: TokenStore;
  log?: (message: string) => void; now?: () => number; random?: () => number;
  setTimer?: (callback: () => void, milliseconds: number) => Timer; clearTimer?: (timer: Timer) => void;
}
interface Connection { socket: WebSocket; transfer: boolean; welcomed: boolean; healthySince: number; timeout: number; timer?: Timer }
export interface Envelope {
  metadata?: { message_type?: string; message_id?: string };
  payload?: { session?: { id?: string; keepalive_timeout_seconds?: number; reconnect_url?: string };
    subscription?: { type?: string }; event?: Record<string, unknown> };
}
const reconnectUrl = (url: string) => {
  try { const u = new URL(url); return u.protocol === "wss:" && u.hostname === "eventsub.wss.twitch.tv" && !u.username && !u.password && !u.port; }
  catch { return false; }
};

/** Injectable I/O permits full handshake/refresh/reconnect tests without live tokens. */
export class TwitchClient {
  private readonly auth: TwitchAuth;
  private readonly connections = new Set<Connection>();
  private readonly now: () => number;
  private readonly setTimer: NonNullable<TwitchOptions["setTimer"]>;
  private readonly clearTimer: NonNullable<TwitchOptions["clearTimer"]>;
  private readonly log: (message: string) => void;
  private active: Connection | undefined;
  private pending: Connection | undefined;
  private retryTimer: Timer | undefined;
  private validateTimer: Timer | undefined;
  private stopped = false;
  private attempt = 0;
  private loaded = false;
  private booting = false;

  constructor(private readonly config: TwitchConfig, private readonly handlers: TwitchHandlers, private readonly options: TwitchOptions = {}) {
    this.now = options.now ?? Date.now;
    this.setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
    this.clearTimer = options.clearTimer ?? clearTimeout;
    this.log = options.log ?? console.warn;
    this.auth = new TwitchAuth(config, options.fetch ?? fetch, options.store ?? tokenStore(config), this.log);
  }
  async start() {
    if (this.stopped || this.booting || this.connections.size) return;
    this.booting = true;
    try {
      if (!this.loaded) { await this.auth.load(); this.loaded = true; }
      await this.auth.validate();
      if (!this.stopped) { this.open(EVENTSUB_URL, false); this.hourlyValidation(); }
    } catch (error) { this.failed(error); }
    finally { this.booting = false; }
  }
  private hourlyValidation() {
    if (this.validateTimer) this.clearTimer(this.validateTimer);
    this.validateTimer = this.setTimer(() => {
      this.validateTimer = undefined;
      void this.auth.validate().then(() => { if (!this.stopped) this.hourlyValidation(); }).catch(error => this.failed(error));
    }, 60 * 60_000);
  }
  private open(url: string, transfer: boolean) {
    if (this.stopped) return;
    let socket: WebSocket;
    try { socket = this.options.socket?.(url) ?? new WebSocket(url, { handshakeTimeout: 10_000, maxPayload: 256 * 1024 }); }
    catch { this.failed(new TwitchError(0, "socket")); return; }
    const connection: Connection = { socket, transfer, welcomed: false, healthySince: this.now(), timeout: 10_000 };
    this.connections.add(connection);
    if (transfer) this.pending = connection; else this.active = connection;
    this.watch(connection);
    socket.on("message", data => {
      if (!this.connections.has(connection) || this.stopped) return;
      let message: Envelope;
      try { message = JSON.parse(data.toString()) as Envelope; } catch { return; }
      if (!message || typeof message !== "object") return;
      void this.message(connection, message).catch(error => { if (this.connections.has(connection)) this.failed(error); });
    });
    socket.on("error", () => { if (this.connections.has(connection)) this.failed(new TwitchError(0, "socket")); });
    socket.on("close", () => { if (this.connections.has(connection)) this.failed(new TwitchError(0, "socket")); });
    // ws responds to protocol ping frames automatically. Never send EventSub data frames.
  }
  private watch(connection: Connection) {
    if (connection.timer) this.clearTimer(connection.timer);
    connection.timer = this.setTimer(() => {
      if (this.connections.has(connection)) this.failed(new TwitchError(0, "keepalive timeout"));
    }, connection.timeout + 1000);
  }
  private retire(connection: Connection) {
    this.connections.delete(connection);
    if (connection.timer) this.clearTimer(connection.timer);
    connection.socket.close(1000);
    // Force-close a peer that never completes the close handshake.
    connection.socket.terminate();
  }
  private teardown() {
    for (const connection of this.connections) this.retire(connection);
    this.active = undefined; this.pending = undefined;
    if (this.validateTimer) this.clearTimer(this.validateTimer);
    this.validateTimer = undefined;
  }
  private failed(error: unknown) {
    if (this.stopped) return;
    this.teardown();
    if (this.retryTimer) return;
    if (error instanceof TwitchError && (error.status === 400 || error.status === 401 || error.status === 403)) {
      this.log("Twitch authorization/scopes are unavailable; sim-only mode remains active. Update credentials and restart.");
      this.stop(); return;
    }
    const delay = Math.min(60_000, 1000 * 2 ** Math.min(this.attempt++, 6) * (0.8 + (this.options.random ?? Math.random)() * 0.4));
    this.log(`Twitch connection interrupted; retrying in ${Math.ceil(delay / 1000)}s. Simulator remains available.`);
    this.retryTimer = this.setTimer(() => { this.retryTimer = undefined; void this.start(); }, delay);
  }
  private async message(connection: Connection, message: Envelope) {
    const type = message.metadata?.message_type;
    if (type === "session_welcome" && !connection.welcomed) {
      const session = message.payload?.session;
      if (!session || typeof session.id !== "string" || !session.id) throw new TwitchError(502, "welcome");
      connection.welcomed = true;
      connection.timeout = Math.max(10, Math.min(600, session.keepalive_timeout_seconds ?? 10)) * 1000;
      this.watch(connection);
      if (connection.transfer) {
        const previous = this.active;
        this.active = connection; this.pending = undefined;
        if (previous && previous !== connection) this.retire(previous);
        // Twitch migrates the subscriptions. Resubscribing here would duplicate them.
      } else {
        const subscriptions = [
          { type: "channel.chat.message", condition: { broadcaster_user_id: this.config.broadcasterId, user_id: this.config.broadcasterId } },
          { type: "channel.raid", condition: { to_broadcaster_user_id: this.config.broadcasterId } },
        ];
        await Promise.all(subscriptions.map(async subscription => {
          const response = await this.auth.helix("eventsub/subscriptions", {
            ...subscription, version: "1", transport: { method: "websocket", session_id: session.id },
          });
          if (!response.ok && response.status !== 409) throw new TwitchError(response.status, "subscription");
        }));
        if (!this.connections.has(connection) || this.stopped) return;
      }
      return;
    }
    if (!connection.welcomed) return;
    if (type === "session_keepalive" || type === "notification") {
      this.watch(connection);
      if (this.now() - connection.healthySince >= 60_000) this.attempt = 0;
    }
    if (type === "session_reconnect" && connection === this.active && !this.pending) {
      const url = message.payload?.session?.reconnect_url;
      if (typeof url !== "string" || !reconnectUrl(url)) throw new TwitchError(502, "reconnect destination");
      this.open(url, true);
    } else if (type === "revocation") {
      throw new TwitchError(403, "subscription revocation");
    } else if (type === "notification") {
      const event = message.payload?.event, subscription = message.payload?.subscription?.type;
      if (!event) return;
      if (subscription === "channel.chat.message" && event.broadcaster_user_id === this.config.broadcasterId) {
        const chatMessage = event.message as { text?: unknown } | undefined;
        try {
          const chat = parseChat({ id: event.message_id, userId: event.chatter_user_id, displayName: event.chatter_user_name,
            text: chatMessage?.text, color: event.color ?? "" });
          const badges = event.badges;
          const moderator = chat.userId === this.config.broadcasterId || (Array.isArray(badges) && badges.some(b => b?.set_id === "moderator" || b?.set_id === "broadcaster"));
          this.handlers.onChat(chat, { moderator });
        } catch { /* Ignore malformed events; never log chat or raw upstream payloads. */ }
      } else {
        const raid=incomingRaid(message,this.config.broadcasterId);if(raid)this.handlers.onRaid(raid);
      }
    }
  }
  async sendChat(message: string) {
    if (this.stopped || !message.trim() || [...message].length > 500) throw new TwitchError(400, "send chat");
    const response = await this.auth.helix("chat/messages", {
      broadcaster_id: this.config.broadcasterId, sender_id: this.config.broadcasterId, message,
    });
    if (!response.ok) throw new TwitchError(response.status, "send chat");
    let body: { data?: { is_sent?: boolean; message_id?: string }[] };
    try { body = await response.json(); } catch { throw new TwitchError(502, "send chat"); }
    if (!body?.data?.[0]?.is_sent) throw new TwitchError(422, "send chat delivery");
    return body.data[0].message_id;
  }
  stop() {
    this.stopped = true;
    if (this.retryTimer) this.clearTimer(this.retryTimer);
    this.teardown();
  }
}

/** A missing Twitch configuration is expected during local development. */
export function connectTwitch(handlers: TwitchHandlers, config?: TwitchConfig, options: TwitchOptions = {}) {
  if (!config) {
    (options.log ?? console.warn)("Twitch env vars are missing; running in sim-only mode. Set TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_ACCESS_TOKEN, TWITCH_REFRESH_TOKEN and TWITCH_BROADCASTER_ID to connect.");
    return { stop() {}, sendChat: async (_message: string): Promise<string | undefined> => { throw new TwitchError(503, "sim-only chat"); } };
  }
  const client = new TwitchClient(config, handlers, options);
  void client.start();
  return client;
}

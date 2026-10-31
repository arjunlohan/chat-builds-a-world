import {atomicJson,readJson} from "../persistence/atomic.js";
import { createHash } from "node:crypto";

export interface TwitchConfig {
  clientId: string; clientSecret: string; accessToken: string; refreshToken: string; broadcasterId: string;
}
export class TwitchError extends Error {
  constructor(readonly status: number, action: string) { super(`Twitch ${action} failed (${status || "network"})`); }
}
export interface TokenPair { accessToken: string; refreshToken: string }
export interface TokenStore { load(): Promise<TokenPair | undefined>; save(tokens: TokenPair): Promise<void> }

/** Rotated refresh tokens survive restart, in an ignored file with private permissions. */
export function tokenStore(config: TwitchConfig, directory = "state"): TokenStore {
  const fingerprint = createHash("sha256").update(config.refreshToken).digest("hex");
  const path = `${directory}/twitch-auth.json`;
  return {
    async load() {
      try {
        const saved = await readJson<TokenPair&{clientId:string;broadcasterId:string;fingerprint:string}>(path);
        if (saved?.clientId === config.clientId && saved.broadcasterId === config.broadcasterId && saved.fingerprint === fingerprint &&
          typeof saved.accessToken === "string" && typeof saved.refreshToken === "string") {
          return { accessToken: saved.accessToken, refreshToken: saved.refreshToken };
        }
      } catch { /* Missing/corrupt state falls back to the environment; never log its content. */ }
      return undefined;
    },
    async save(tokens) {
      await atomicJson(path,{...tokens,fingerprint,clientId:config.clientId,broadcasterId:config.broadcasterId});
    },
  };
}

export class TwitchAuth {
  private tokens: TokenPair;
  private refreshing: Promise<void> | undefined;
  constructor(private readonly config: TwitchConfig, private readonly fetcher: typeof fetch = fetch,
    private readonly store?: TokenStore, private readonly warn: (message: string) => void = console.warn) {
    this.tokens = { accessToken: config.accessToken, refreshToken: config.refreshToken };
  }
  async load() { const saved = await this.store?.load(); if (saved) this.tokens = saved; }
  private async request(url: string, init: RequestInit) {
    try { return await this.fetcher(url, { ...init, signal: AbortSignal.timeout(8000) }); }
    catch { throw new TwitchError(0, "request"); }
  }
  private refresh() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const response = await this.request("https://id.twitch.tv/oauth2/token", {
        method: "POST", body: new URLSearchParams({ grant_type: "refresh_token", client_id: this.config.clientId,
          client_secret: this.config.clientSecret, refresh_token: this.tokens.refreshToken }),
      });
      if (!response.ok) throw new TwitchError(response.status, "token refresh");
      let body: unknown;
      try { body = await response.json(); } catch { throw new TwitchError(502, "token refresh"); }
      const pair = body as { access_token?: unknown; refresh_token?: unknown };
      if (!pair || typeof pair.access_token !== "string" || !pair.access_token || typeof pair.refresh_token !== "string" || !pair.refresh_token) {
        throw new TwitchError(502, "token refresh");
      }
      this.tokens = { accessToken: pair.access_token, refreshToken: pair.refresh_token };
      try { await this.store?.save(this.tokens); }
      catch { this.warn("Twitch token rotation could not be saved; the current session remains active."); }
    })().finally(() => { this.refreshing = undefined; });
    return this.refreshing;
  }
  async validate() {
    const run = () => this.request("https://id.twitch.tv/oauth2/validate", { headers: { Authorization: `OAuth ${this.tokens.accessToken}` } });
    const token = this.tokens.accessToken;
    let response = await run();
    if (response.status === 401) { if (this.tokens.accessToken === token) await this.refresh(); response = await run(); }
    if (!response.ok) throw new TwitchError(response.status, "token validation");
    let value: unknown;
    try { value = await response.json(); } catch { throw new TwitchError(502, "token validation"); }
    const body = value as { client_id?: unknown; user_id?: unknown; scopes?: unknown };
    if (!body || body.client_id !== this.config.clientId || body.user_id !== this.config.broadcasterId || !Array.isArray(body.scopes) ||
      !body.scopes.includes("user:read:chat") || !body.scopes.includes("user:write:chat")) throw new TwitchError(403, "identity/scopes validation");
  }
  async helix(path: string, body: object): Promise<Response> {
    const run = () => this.request(`https://api.twitch.tv/helix/${path}`, {
      method: "POST", headers: { Authorization: `Bearer ${this.tokens.accessToken}`, "Client-Id": this.config.clientId, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const token = this.tokens.accessToken;
    let response = await run();
    if (response.status === 401) { if (this.tokens.accessToken === token) await this.refresh(); response = await run(); }
    return response;
  }
}

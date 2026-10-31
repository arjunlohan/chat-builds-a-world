import { config as loadEnv } from "dotenv";
import type { TwitchConfig } from "./twitch/auth.js";

/** dotenv is quiet and server-only. Never spread or log the environment/config. */
export function readConfig() {
  loadEnv({ quiet: true });
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer between 1 and 65535");
  const values = [process.env.TWITCH_CLIENT_ID, process.env.TWITCH_CLIENT_SECRET, process.env.TWITCH_ACCESS_TOKEN,
    process.env.TWITCH_REFRESH_TOKEN, process.env.TWITCH_BROADCASTER_ID];
  const twitch: TwitchConfig | undefined = values.every(value => typeof value === "string" && value.trim()) ? {
    clientId: values[0]!, clientSecret: values[1]!, accessToken: values[2]!, refreshToken: values[3]!, broadcasterId: values[4]!,
  } : undefined;
  return { host: "127.0.0.1", port, twitch } as const;
}

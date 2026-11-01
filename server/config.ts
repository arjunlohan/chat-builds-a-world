import { config as loadEnv } from "dotenv";
import type { SummonConfig } from "./summon/provider.js";
import type { TwitchConfig } from "./twitch/auth.js";

/** dotenv is quiet and server-only. Never spread or log the environment/config. */
export function readConfig() {
  loadEnv({ quiet: true });
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer between 1 and 65535");
  const worldLook=process.env.WORLD_LOOK??"new";if(worldLook!=="new"&&worldLook!=="classic")throw new Error("WORLD_LOOK must be new or classic");
  const values = [process.env.TWITCH_CLIENT_ID, process.env.TWITCH_CLIENT_SECRET, process.env.TWITCH_ACCESS_TOKEN,
    process.env.TWITCH_REFRESH_TOKEN, process.env.TWITCH_BROADCASTER_ID];
  const twitch: TwitchConfig | undefined = values.every(value => typeof value === "string" && value.trim()) ? {
    clientId: values[0]!, clientSecret: values[1]!, accessToken: values[2]!, refreshToken: values[3]!, broadcasterId: values[4]!,
  } : undefined;
  const summon: SummonConfig = {
    ...(process.env.AWS_BEARER_TOKEN_BEDROCK ? { key: process.env.AWS_BEARER_TOKEN_BEDROCK } : {}),
    model: process.env.SUMMON_MODEL ?? "openai.gpt-6.1-sol",
    effort: process.env.SUMMON_REASONING_EFFORT ?? "max", tier: process.env.SUMMON_SERVICE_TIER ?? "ultrafast",
  };
  return { worldLook, demoMode:process.env.DEMO_MODE==="1", broadcasterId: twitch?.broadcasterId??"sim-broadcaster", simulationAllowed: process.env.SIMULATION_ALLOWED === "1" || (process.env.SIMULATION_ALLOWED !== "0" && !twitch), fixtureMode: process.env.SIMULATION_MODE === "fixture", summon, host: "127.0.0.1", port, twitch } as const;
}

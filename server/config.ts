/** Deliberately reads no secrets and loads no .env file in Phase 1. */
export function readConfig() {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return { host: "127.0.0.1", port } as const;
}

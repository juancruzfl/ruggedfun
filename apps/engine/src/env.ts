import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {
  // No .env file: rely on the real environment.
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name} (see .env.example)`);
  return value;
}

function number(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Env var ${name} must be a number, got "${raw}"`);
  return value;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  /** Shared with the web app; guards the internal trade endpoint. */
  engineSecret: required("ENGINE_SECRET"),
  port: number("ENGINE_PORT", 3001),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  launchMinSeconds: number("LAUNCH_MIN_SECONDS", 5),
  launchMaxSeconds: number("LAUNCH_MAX_SECONDS", 20),
  bootstrapTokens: number("BOOTSTRAP_TOKENS", 12),
  /** Global cap on bot trades per second across all tokens. 0 turns bots off. */
  botTradesPerSecond: number("BOT_TRADES_PER_SECOND", 6),
};

import { createDb } from "@ruggedfun/db";
import { env } from "./env";
import { BotFlow } from "./bots";
import { Market } from "./market";
import { createRealtimeServer } from "./server";
import { PgStore } from "./store";
import { Trading } from "./trading";

const FLUSH_MS = 5_000;
const PRUNE_MS = 60 * 60_000;
const SNAPSHOT_MS = 10 * 60_000;
const BOOTSTRAP_MAX_AGE_MS = 30 * 60_000;

const log = (...args: unknown[]) => console.log(new Date().toISOString(), ...args);

async function main() {
  const { db, client } = createDb(env.databaseUrl);
  const store = new PgStore(db, client);
  const realtime = createRealtimeServer(env.webOrigin, env.engineSecret);
  const market = new Market(store, realtime.events, { bots: new BotFlow(env.botTradesPerSecond) });
  realtime.attach(market, new Trading(market, db));

  await market.restore(Date.now());
  log(`restored ${market.size} live tokens`);

  if (market.size === 0 && env.bootstrapTokens > 0) {
    const now = Date.now();
    for (let i = 0; i < env.bootstrapTokens; i++) {
      await market.launch(now, { backdateMs: Math.random() * BOOTSTRAP_MAX_AGE_MS });
    }
    log(`bootstrapped ${env.bootstrapTokens} tokens`);
  }
  await market.flush();

  const tickTimer = setInterval(() => market.tick(Date.now()), 1000);

  let flushing = false;
  const flushTimer = setInterval(async () => {
    if (flushing) return;
    flushing = true;
    try {
      await market.flush();
    } catch (err) {
      log("flush failed", err);
    } finally {
      flushing = false;
    }
  }, FLUSH_MS);

  const pruneTimer = setInterval(() => {
    store.prune(Date.now()).catch((err) => log("prune failed", err));
  }, PRUNE_MS);

  const snapshot = () => store.snapshotNetWorth(Date.now()).catch((err) => log("net worth snapshot failed", err));
  void snapshot();
  const snapshotTimer = setInterval(snapshot, SNAPSHOT_MS);

  const statsTimer = setInterval(() => log(`${market.size} live tokens, ${realtime.io.engine.clientsCount} clients`), 60_000);

  let launchTimer: NodeJS.Timeout;
  const scheduleLaunch = () => {
    const seconds = env.launchMinSeconds + Math.random() * (env.launchMaxSeconds - env.launchMinSeconds);
    launchTimer = setTimeout(async () => {
      try {
        const token = await market.launch(Date.now());
        log(`launched $${token.ticker} (${token.name})`);
      } catch (err) {
        log("launch failed", err);
      }
      scheduleLaunch();
    }, seconds * 1000);
  };
  scheduleLaunch();

  realtime.httpServer.listen(env.port, () => log(`engine listening on :${env.port}`));

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`${signal}: flushing and shutting down`);
    for (const timer of [tickTimer, flushTimer, pruneTimer, snapshotTimer, statsTimer]) clearInterval(timer);
    clearTimeout(launchTimer);
    try {
      await market.flush();
    } catch (err) {
      log("final flush failed", err);
    }
    realtime.io.close();
    await client.end();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";

/** What real players (not the market's bots) have been up to. */
export interface PlayerStats {
  /** SOL traded by players, buys and sells, all time and in the last 24 hours. */
  volumeSol: number;
  volume24hSol: number;
  trades24h: number;
  players: number;
  /** Players who traded in the last 24 hours. */
  activePlayers24h: number;
  launches: number;
  launches24h: number;
  /** The best single sell in the last 24 hours, by realized profit. */
  biggestWin24h: { username: string; ticker: string; pnlSol: number; multiple: number } | null;
}

const CACHE_MS = 30_000;
let cache: { at: number; data: Promise<PlayerStats> } | null = null;

/** Player-only stats for the home page, recomputed at most every 30 seconds per server instance. */
export function getPlayerStats(): Promise<PlayerStats> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const data = compute();
  cache = { at: Date.now(), data };
  data.catch(() => (cache = null));
  return data;
}

async function compute(): Promise<PlayerStats> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  // Bot trades have no user_id, so `user_id is not null` is "real players only".
  const [totals, win] = await Promise.all([
    db.execute(sql`
      select
        coalesce((select sum(sol_amount) from trades where user_id is not null), 0)::float8 as volume,
        coalesce(sum(sol_amount), 0)::float8 as volume_24h,
        count(*)::int as trades_24h,
        count(distinct user_id)::int as active_24h,
        (select count(*) from users)::int as players,
        (select count(*) from tokens where creator_user_id is not null)::int as launches,
        (select count(*) from tokens where creator_user_id is not null and created_at >= ${since}::timestamptz)::int as launches_24h
      from trades
      where user_id is not null and created_at >= ${since}::timestamptz
    `),
    db.execute(sql`
      select u.username, k.ticker, t.realized_pnl_sol::float8 as pnl, t.sol_amount::float8 as sol
      from trades t
      join users u on u.id = t.user_id
      join tokens k on k.id = t.token_id
      where t.user_id is not null and t.realized_pnl_sol > 0 and t.created_at >= ${since}::timestamptz
      order by t.realized_pnl_sol desc
      limit 1
    `),
  ]);

  const t = (totals as unknown as Record<string, number>[])[0]!;
  const w = (win as unknown as { username: string; ticker: string; pnl: number; sol: number }[])[0];
  return {
    volumeSol: t.volume ?? 0,
    volume24hSol: t.volume_24h ?? 0,
    trades24h: t.trades_24h ?? 0,
    players: t.players ?? 0,
    activePlayers24h: t.active_24h ?? 0,
    launches: t.launches ?? 0,
    launches24h: t.launches_24h ?? 0,
    // A sell's cost basis is its proceeds minus its profit, so the multiple is proceeds / cost.
    biggestWin24h: w ? { username: w.username, ticker: w.ticker, pnlSol: w.pnl, multiple: w.sol / (w.sol - w.pnl) } : null,
  };
}

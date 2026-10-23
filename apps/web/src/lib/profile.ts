import "server-only";
import { STARTING_SOL } from "@ruggedfun/shared";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { getLeaderboard, positionValueSql } from "./leaderboard";

/** A player's public profile: their PnL and track record, as shown on /u/[username] and its share card. */
export interface Profile {
  userId: string;
  username: string;
  joinedAt: number;
  /** SOL plus what their positions would sell for right now. */
  netWorthSol: number;
  /** Against the starting balance. */
  pnlSol: number;
  pnlPct: number;
  /** Against their net worth 24 hours ago (or the starting balance, for younger accounts). */
  pnl24hSol: number;
  pnl24hPct: number;
  trades: number;
  /** Share of sells that made money; null before the first sell. */
  winRate: number | null;
  bestWin: { pnlSol: number; multiple: number; ticker: string } | null;
  rugs: number;
  launches: number;
  /** All-time leaderboard place, if they've traded. */
  rank: { place: number; of: number } | null;
  /** Net worth over the last 24 hours (oldest first), ending with the current value. */
  history: number[];
}

/** Finds a player by username (any case). Null if there's no such player. */
export async function getProfile(username: string): Promise<Profile | null> {
  const [user] = (await db.execute(sql`
    select u.id, u.username, u.created_at, w.sol_balance + coalesce(sum(${positionValueSql}), 0) as net_worth
    from users u
    join wallets w on w.user_id = u.id
    left join positions p on p.user_id = u.id
    left join tokens t on t.id = p.token_id
    where lower(u.username) = lower(${username})
    group by u.id, u.username, u.created_at, w.sol_balance
  `)) as unknown as { id: string; username: string; created_at: string | Date; net_worth: number }[];
  if (!user) return null;

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [[stats], [best], [counts], snapshots, leaderboard] = await Promise.all([
    db.execute(sql`
      select count(*)::int as trades,
             count(*) filter (where realized_pnl_sol is not null)::int as sells,
             count(*) filter (where realized_pnl_sol > 0)::int as wins
      from trades where user_id = ${user.id}
    `) as unknown as Promise<{ trades: number; sells: number; wins: number }[]>,
    db.execute(sql`
      select tr.realized_pnl_sol::float8 as pnl, tr.sol_amount::float8 as proceeds, tk.ticker
      from trades tr join tokens tk on tk.id = tr.token_id
      where tr.user_id = ${user.id} and tr.realized_pnl_sol > 0
      order by tr.realized_pnl_sol desc
      limit 1
    `) as unknown as Promise<{ pnl: number; proceeds: number; ticker: string }[]>,
    db.execute(sql`
      select (select count(*) from rug_victims where user_id = ${user.id})::int as rugs,
             (select count(*) from tokens where creator_user_id = ${user.id})::int as launches,
             (select net_worth_sol from net_worth_snapshots
              where user_id = ${user.id} and at <= ${since}::timestamptz
              order by at desc limit 1)::float8 as baseline_24h
    `) as unknown as Promise<{ rugs: number; launches: number; baseline_24h: number | null }[]>,
    db.execute(sql`
      select net_worth_sol::float8 as worth from net_worth_snapshots
      where user_id = ${user.id} and at > ${since}::timestamptz
      order by at
    `) as unknown as Promise<{ worth: number }[]>,
    getLeaderboard("all"),
  ]);

  const netWorth = Number(user.net_worth);
  const baseline24h = counts?.baseline_24h ?? STARTING_SOL;
  const place = leaderboard.tab === "all" ? leaderboard.rows.find((r) => r.userId === user.id)?.rank : undefined;
  return {
    userId: user.id,
    username: user.username,
    joinedAt: new Date(user.created_at).getTime(),
    netWorthSol: netWorth,
    pnlSol: netWorth - STARTING_SOL,
    pnlPct: netWorth / STARTING_SOL - 1,
    pnl24hSol: netWorth - baseline24h,
    pnl24hPct: baseline24h > 0 ? netWorth / baseline24h - 1 : 0,
    trades: stats?.trades ?? 0,
    winRate: stats && stats.sells > 0 ? stats.wins / stats.sells : null,
    // A sell's cost basis is its proceeds minus its profit, so the multiple is proceeds / cost.
    bestWin: best ? { pnlSol: best.pnl, multiple: best.proceeds / (best.proceeds - best.pnl), ticker: best.ticker } : null,
    rugs: counts?.rugs ?? 0,
    launches: counts?.launches ?? 0,
    rank: place ? { place, of: leaderboard.rows.length } : null,
    history: [...snapshots.map((s) => s.worth), netWorth],
  };
}

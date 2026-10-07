import "server-only";
import { STARTING_SOL } from "@ruggedfun/shared";
import { CURVE } from "@ruggedfun/sim";
import { sql } from "drizzle-orm";
import { db } from "./db";

export const LEADERBOARD_TABS = ["all", "24h", "wins", "shame"] as const;
export type LeaderboardTab = (typeof LEADERBOARD_TABS)[number];

export interface PnlRow {
  rank: number;
  userId: string;
  username: string;
  netWorthSol: number;
  pnlSol: number;
  pnlPct: number;
  trades: number;
  /** Share of sells that made money; null before the first sell. */
  winRate: number | null;
}

export interface WinRow {
  rank: number;
  userId: string;
  username: string;
  pnlSol: number;
  multiple: number;
  ticker: string;
  at: number;
}

export interface ShameRow {
  rank: number;
  userId: string;
  username: string;
  rugs: number;
  lostSol: number;
  worstTicker: string;
}

export type LeaderboardRows = { tab: "all" | "24h"; rows: PnlRow[] } | { tab: "wins"; rows: WinRow[] } | { tab: "shame"; rows: ShameRow[] };

const CACHE_MS = 30_000;
const cache = new Map<LeaderboardTab, { at: number; data: Promise<LeaderboardRows> }>();

/** Full ranking for a tab, recomputed at most every 30 seconds per server instance. */
export function getLeaderboard(tab: LeaderboardTab): Promise<LeaderboardRows> {
  const hit = cache.get(tab);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const data = compute(tab);
  cache.set(tab, { at: Date.now(), data });
  data.catch(() => cache.delete(tab));
  return data;
}

async function compute(tab: LeaderboardTab): Promise<LeaderboardRows> {
  switch (tab) {
    case "all":
      return { tab, rows: await pnlRows(null) };
    case "24h":
      return { tab, rows: await pnlRows(24) };
    case "wins":
      return { tab, rows: await winRows() };
    case "shame":
      return { tab, rows: await shameRows() };
  }
}

const rank = <T>(rows: T[]) => rows.map((row, i) => ({ ...row, rank: i + 1 }));

/**
 * SQL twin of positionValue / liquidationValue (packages/sim): what position `p` in token `t`
 * would sell for right now. Tokens that stopped trading keep their last price.
 */
const sellable = sql`least(p.token_amount, ${CURVE.curveTokens} - t.tokens_left)`;
const positionValueSql = sql`case
  when t.ended_at is null then greatest(0, t.price * t.virtual_tokens * ${sellable} / (t.virtual_tokens + ${sellable}))
                               * ${1 - CURVE.feeBps / 10_000}
  else p.token_amount * t.price
end`;

/**
 * Net worth = SOL + positions at the last stored price (dead tokens keep their final price).
 * All-time PnL is against the starting balance; 24h PnL is against the newest snapshot that is at
 * least 24 hours old, or the starting balance for accounts younger than that.
 */
async function pnlRows(windowHours: number | null): Promise<PnlRow[]> {
  const since = windowHours === null ? null : new Date(Date.now() - windowHours * 3600_000).toISOString();
  const rows = (await db.execute(sql`
    with worth as (
      select u.id, u.username, w.sol_balance + coalesce(sum(${positionValueSql}), 0) as net_worth
      from users u
      join wallets w on w.user_id = u.id
      left join positions p on p.user_id = u.id
      left join tokens t on t.id = p.token_id
      group by u.id, u.username, w.sol_balance
    ),
    stats as (
      select user_id,
             count(*)::int as trades,
             count(*) filter (where realized_pnl_sol is not null)::int as sells,
             count(*) filter (where realized_pnl_sol > 0)::int as wins
      from trades
      where user_id is not null ${since ? sql`and created_at >= ${since}::timestamptz` : sql``}
      group by user_id
    )
    select worth.id, worth.username, worth.net_worth::float8 as net_worth, stats.trades, stats.sells, stats.wins,
      ${
        since
          ? sql`coalesce((select s.net_worth_sol from net_worth_snapshots s
                          where s.user_id = worth.id and s.at <= ${since}::timestamptz
                          order by s.at desc limit 1), ${STARTING_SOL})::float8`
          : sql`${STARTING_SOL}::float8`
      } as baseline
    from worth join stats on stats.user_id = worth.id
  `)) as unknown as {
    id: string;
    username: string;
    net_worth: number;
    trades: number;
    sells: number;
    wins: number;
    baseline: number;
  }[];

  return rank(
    rows
      .map((r) => ({
        userId: r.id,
        username: r.username,
        netWorthSol: r.net_worth,
        pnlSol: r.net_worth - r.baseline,
        pnlPct: r.baseline > 0 ? r.net_worth / r.baseline - 1 : 0,
        trades: r.trades,
        winRate: r.sells > 0 ? r.wins / r.sells : null,
      }))
      .sort((a, b) => b.pnlSol - a.pnlSol),
  );
}

/** Each player's single most profitable sell. */
async function winRows(): Promise<WinRow[]> {
  const rows = (await db.execute(sql`
    select distinct on (tr.user_id)
      tr.user_id, u.username, tr.realized_pnl_sol as pnl, tr.sol_amount as proceeds, tk.ticker, tr.created_at
    from trades tr
    join users u on u.id = tr.user_id
    join tokens tk on tk.id = tr.token_id
    where tr.realized_pnl_sol > 0
    order by tr.user_id, tr.realized_pnl_sol desc
  `)) as unknown as { user_id: string; username: string; pnl: number; proceeds: number; ticker: string; created_at: string | Date }[];

  return rank(
    rows
      .map((r) => ({
        userId: r.user_id,
        username: r.username,
        pnlSol: r.pnl,
        multiple: r.proceeds / (r.proceeds - r.pnl),
        ticker: r.ticker,
        at: new Date(r.created_at).getTime(),
      }))
      .sort((a, b) => b.pnlSol - a.pnlSol),
  );
}

/** SOL that was sitting in tokens when they rugged. */
async function shameRows(): Promise<ShameRow[]> {
  const rows = (await db.execute(sql`
    select rv.user_id, u.username, count(*)::int as rugs, sum(rv.cost_basis_sol)::float8 as lost,
           (array_agg(t.ticker order by rv.cost_basis_sol desc))[1] as worst
    from rug_victims rv
    join users u on u.id = rv.user_id
    join tokens t on t.id = rv.token_id
    group by rv.user_id, u.username
  `)) as unknown as { user_id: string; username: string; rugs: number; lost: number; worst: string }[];

  return rank(
    rows
      .map((r) => ({ userId: r.user_id, username: r.username, rugs: r.rugs, lostSol: r.lost, worstTicker: r.worst }))
      .sort((a, b) => b.lostSol - a.lostSol),
  );
}

import "server-only";
import { candles, tokens, trades, users } from "@ruggedfun/db";
import type { CandleInterval, TokenSummary, TradeEvent } from "@ruggedfun/shared";
import { bondingProgress, CURVE } from "@ruggedfun/sim";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "./db";

// Explicit column list: `seed` and `fate` must never reach the browser.
const summaryColumns = {
  id: tokens.id,
  name: tokens.name,
  ticker: tokens.ticker,
  imageUrl: tokens.imageUrl,
  description: tokens.description,
  creatorHandle: tokens.creatorHandle,
  byPlayer: sql<boolean>`${tokens.creatorUserId} is not null`,
  status: tokens.status,
  price: tokens.price,
  marketCap: tokens.marketCap,
  athPrice: tokens.athPrice,
  createdAt: tokens.createdAt,
  graduatedAt: tokens.graduatedAt,
  endedAt: tokens.endedAt,
};

const selectSummaries = () => db.select(summaryColumns).from(tokens);
type SummaryRow = Awaited<ReturnType<typeof selectSummaries>>[number];

function toSummary(row: SummaryRow): TokenSummary {
  return {
    ...row,
    bondingProgress: bondingProgress(row.price),
    createdAt: row.createdAt.getTime(),
    graduatedAt: row.graduatedAt?.getTime() ?? null,
    endedAt: row.endedAt?.getTime() ?? null,
  };
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function findTokenByTicker(ticker: string): Promise<TokenSummary | null> {
  const [row] = await selectSummaries().where(eq(tokens.ticker, ticker)).limit(1);
  return row ? toSummary(row) : null;
}

/** Matches name or ticker anywhere. Exact ticker, then ticker prefix, then still-trading, then market cap. */
export async function searchTokens(query: string, limit = 8): Promise<TokenSummary[]> {
  const term = query.trim().replace(/^\$/, "").slice(0, 32);
  if (!term) return [];
  const anywhere = `%${escapeLike(term)}%`;
  const prefix = `${escapeLike(term)}%`;

  const rows = await selectSummaries()
    .where(or(ilike(tokens.ticker, anywhere), ilike(tokens.name, anywhere)))
    .orderBy(
      sql`upper(${tokens.ticker}) = upper(${term}) desc`,
      sql`${tokens.ticker} ilike ${prefix} desc`,
      sql`${tokens.endedAt} is null desc`,
      desc(tokens.marketCap),
    )
    .limit(limit);
  return rows.map(toSummary);
}

/** Most recently rugged tokens, for the graveyard tab. Ones still in their afterlife come first. */
export async function recentRugged(limit = 60): Promise<TokenSummary[]> {
  const rows = await selectSummaries()
    .where(eq(tokens.status, "rugged"))
    .orderBy(sql`${tokens.endedAt} desc nulls first`)
    .limit(limit);
  return rows.map(toSummary);
}

/** Candles in lightweight-charts shape (time in unix seconds), oldest first. */
export async function getCandles(tokenId: string, interval: CandleInterval, limit = 720) {
  const rows = await db
    .select({
      ts: candles.ts,
      open: candles.open,
      high: candles.high,
      low: candles.low,
      close: candles.close,
      volume: candles.volume,
    })
    .from(candles)
    .where(and(eq(candles.tokenId, tokenId), eq(candles.interval, interval)))
    .orderBy(desc(candles.ts))
    .limit(limit);
  return rows.reverse().map(({ ts, ...c }) => ({ time: ts.getTime() / 1000, ...c }));
}

/** Most recent trades on a token, newest first, in the same shape the engine broadcasts. */
/** A trade as listed on the page: everything the engine broadcasts except the post-trade curve. */
export type ListedTrade = Omit<TradeEvent, "priceAfter" | "curve">;

export async function getRecentTrades(token: TokenSummary, limit = 50): Promise<ListedTrade[]> {
  const rows = await db
    .select({
      id: trades.id,
      side: trades.side,
      solAmount: trades.solAmount,
      tokenAmount: trades.tokenAmount,
      price: trades.price,
      username: users.username,
      botHandle: trades.botHandle,
      realizedPnlSol: trades.realizedPnlSol,
      createdAt: trades.createdAt,
    })
    .from(trades)
    .leftJoin(users, eq(users.id, trades.userId))
    .where(eq(trades.tokenId, token.id))
    .orderBy(desc(trades.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    tokenId: token.id,
    ticker: token.ticker,
    name: token.name,
    imageUrl: token.imageUrl,
    side: r.side,
    solAmount: r.solAmount,
    tokenAmount: r.tokenAmount,
    price: r.price,
    trader: r.username ?? r.botHandle ?? "anon",
    isBot: r.username === null && r.botHandle !== null,
    isDev: r.botHandle !== null && r.botHandle === token.creatorHandle,
    realizedPnlSol: r.realizedPnlSol,
    at: r.createdAt.getTime(),
  }));
}

/** Most recent trades across every token, newest first, for the live feed. */
export async function getRecentTradesAll(limit = 100): Promise<ListedTrade[]> {
  const rows = await db
    .select({
      id: trades.id,
      tokenId: trades.tokenId,
      ticker: tokens.ticker,
      name: tokens.name,
      imageUrl: tokens.imageUrl,
      creatorHandle: tokens.creatorHandle,
      side: trades.side,
      solAmount: trades.solAmount,
      tokenAmount: trades.tokenAmount,
      price: trades.price,
      username: users.username,
      botHandle: trades.botHandle,
      realizedPnlSol: trades.realizedPnlSol,
      createdAt: trades.createdAt,
    })
    .from(trades)
    .innerJoin(tokens, eq(tokens.id, trades.tokenId))
    .leftJoin(users, eq(users.id, trades.userId))
    .orderBy(desc(trades.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    tokenId: r.tokenId,
    ticker: r.ticker,
    name: r.name,
    imageUrl: r.imageUrl,
    side: r.side,
    solAmount: r.solAmount,
    tokenAmount: r.tokenAmount,
    price: r.price,
    trader: r.username ?? r.botHandle ?? "anon",
    isBot: r.username === null && r.botHandle !== null,
    isDev: r.botHandle !== null && r.botHandle === r.creatorHandle,
    realizedPnlSol: r.realizedPnlSol,
    at: r.createdAt.getTime(),
  }));
}

/** SOL volume traded on a token: all time and in the last 24 hours. */
export async function getVolume(tokenId: string): Promise<{ total: number; day: number }> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${trades.solAmount}), 0)::float8`,
      day: sql<number>`coalesce(sum(${trades.solAmount}) filter (where ${trades.createdAt} > now() - interval '24 hours'), 0)::float8`,
    })
    .from(trades)
    .where(eq(trades.tokenId, tokenId));
  return { total: row?.total ?? 0, day: row?.day ?? 0 };
}

export interface Holder {
  rank: number;
  trader: string;
  isBot: boolean;
  isDev: boolean;
  tokenAmount: number;
  /** Share of the total token supply, 0–1. */
  supplyShare: number;
}

const HOLDER_DUST_TOKENS = 1;

/**
 * Top holders: each trader's net buys minus sells (bots included, since their flow is the market).
 * Bot trades are pruned a day after a token ends, so old tokens lose their bot holders.
 */
export async function getHolders(
  tokenId: string,
  options: { limit?: number; me?: string } = {},
): Promise<{ holders: Holder[]; count: number; mine: Holder | null }> {
  const limit = options.limit ?? 20;
  const rows = (await db.execute(sql`
    with net as (
      select coalesce(u.username, tr.bot_handle) as trader,
             bool_and(tr.user_id is null) as is_bot,
             sum(case when tr.side = 'buy' then tr.token_amount else -tr.token_amount end)::float8 as amount
      from trades tr
      left join users u on u.id = tr.user_id
      where tr.token_id = ${tokenId}::uuid
      group by 1
    ),
    ranked as (
      select net.trader, net.is_bot, net.amount, net.trader = t.creator_handle and net.is_bot as is_dev,
             row_number() over (order by net.amount desc)::int as rank,
             count(*) over ()::int as total
      from net, tokens t
      where t.id = ${tokenId}::uuid and net.trader is not null and net.amount > ${HOLDER_DUST_TOKENS}
    )
    select * from ranked
    where rank <= ${limit} or (${options.me ?? null}::text is not null and trader = ${options.me ?? null} and not is_bot)
    order by rank
  `)) as unknown as { trader: string; is_bot: boolean; amount: number; is_dev: boolean; rank: number; total: number }[];

  const holders = rows.map((r) => ({
    rank: r.rank,
    trader: r.trader,
    isBot: r.is_bot,
    isDev: r.is_dev,
    tokenAmount: r.amount,
    supplyShare: r.amount / CURVE.totalSupply,
  }));
  const mine = holders.find((h) => h.rank > limit) ?? null;
  return { count: rows[0]?.total ?? 0, holders: holders.filter((h) => h.rank <= limit), mine };
}

/** A player's cash in and out of one token: SOL spent on buys (and tokens bought), SOL received from sells. */
export interface TokenFlows {
  boughtSol: number;
  boughtTokens: number;
  soldSol: number;
}

export async function getTokenFlows(userId: string, tokenId: string): Promise<TokenFlows> {
  const [row] = await db
    .select({
      boughtSol: sql<number>`coalesce(sum(${trades.solAmount}) filter (where ${trades.side} = 'buy'), 0)::float8`,
      boughtTokens: sql<number>`coalesce(sum(${trades.tokenAmount}) filter (where ${trades.side} = 'buy'), 0)::float8`,
      soldSol: sql<number>`coalesce(sum(${trades.solAmount}) filter (where ${trades.side} = 'sell'), 0)::float8`,
    })
    .from(trades)
    .where(and(eq(trades.userId, userId), eq(trades.tokenId, tokenId)));
  return { boughtSol: row?.boughtSol ?? 0, boughtTokens: row?.boughtTokens ?? 0, soldSol: row?.soldSol ?? 0 };
}

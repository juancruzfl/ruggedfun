import "server-only";
import { candles, tokens, trades, users } from "@ruggedfun/db";
import type { CandleInterval, TokenSummary, TradeEvent } from "@ruggedfun/shared";
import { bondingProgress } from "@ruggedfun/sim";
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

/** All-time SOL volume traded on a token. */
export async function getVolumeSol(tokenId: string): Promise<number> {
  const [row] = await db
    .select({ volume: sql<number>`coalesce(sum(${trades.solAmount}), 0)::float8` })
    .from(trades)
    .where(eq(trades.tokenId, tokenId));
  return row?.volume ?? 0;
}

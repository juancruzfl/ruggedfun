import { candles, netWorthSnapshots, tokens, trades, type Db, type SqlClient, type TokenRow } from "@ruggedfun/db";
import type { Candle, TradeEvent } from "@ruggedfun/shared";
import { bondingProgress, CURVE } from "@ruggedfun/sim";
import { and, inArray, isNull, lt, sql } from "drizzle-orm";
import { TickerTakenError, type MarketStore, type StoredToken } from "./market";

const CANDLE_BATCH = 1000;

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

// The bulk `values` list is sent as text, so timestamps go as ISO strings.
const toIso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

function toStored(row: TokenRow): StoredToken {
  return {
    seed: row.seed,
    fate: row.fate,
    curve: { virtualSol: row.virtualSol, virtualTokens: row.virtualTokens, tokensLeft: row.tokensLeft },
    summary: {
      id: row.id,
      name: row.name,
      ticker: row.ticker,
      imageUrl: row.imageUrl,
      description: row.description,
      creatorHandle: row.creatorHandle,
      status: row.status,
      price: row.price,
      marketCap: row.marketCap,
      athPrice: row.athPrice,
      bondingProgress: bondingProgress(row.price),
      createdAt: row.createdAt.getTime(),
      graduatedAt: row.graduatedAt?.getTime() ?? null,
      endedAt: row.endedAt?.getTime() ?? null,
    },
  };
}

export class PgStore implements MarketStore {
  constructor(
    private readonly db: Db,
    private readonly sql: SqlClient,
  ) {}

  async insertToken({ summary, seed, fate, curve }: StoredToken): Promise<void> {
    try {
      await this.db.insert(tokens).values({
        id: summary.id,
        name: summary.name,
        ticker: summary.ticker,
        imageUrl: summary.imageUrl,
        description: summary.description,
        creatorHandle: summary.creatorHandle,
        seed,
        fate,
        status: summary.status,
        ...curve,
        price: summary.price,
        athPrice: summary.athPrice,
        marketCap: summary.marketCap,
        createdAt: new Date(summary.createdAt),
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new TickerTakenError(summary.ticker);
      throw err;
    }
  }

  async loadBotHoldings(tokenIds: string[]): Promise<Map<string, Map<string, number>>> {
    const result = new Map<string, Map<string, number>>();
    if (tokenIds.length === 0) return result;
    const rows = await this.sql<{ token_id: string; bot_handle: string; amount: number }[]>`
      select token_id, bot_handle,
             sum(case when side = 'buy' then token_amount else -token_amount end)::float8 as amount
      from trades
      where bot_handle is not null and token_id = any(${tokenIds}::uuid[])
      group by token_id, bot_handle
      having sum(case when side = 'buy' then token_amount else -token_amount end) > 1`;
    for (const row of rows) {
      if (!result.has(row.token_id)) result.set(row.token_id, new Map());
      result.get(row.token_id)!.set(row.bot_handle, row.amount);
    }
    return result;
  }

  async loadLive(): Promise<StoredToken[]> {
    const rows = await this.db.select().from(tokens).where(isNull(tokens.endedAt));
    return rows.map(toStored);
  }

  async save(stored: StoredToken[], newCandles: Candle[], botTrades: TradeEvent[]): Promise<void> {
    if (botTrades.length > 0) {
      await this.db.insert(trades).values(
        botTrades.map((t) => ({
          id: t.id,
          tokenId: t.tokenId,
          botHandle: t.trader,
          side: t.side,
          solAmount: t.solAmount,
          tokenAmount: t.tokenAmount,
          price: t.price,
          createdAt: new Date(t.at),
        })),
      );
    }

    if (stored.length > 0) {
      const rows = stored.map(({ summary: s, curve: c }) => [
        s.id, s.status, s.price, s.athPrice, s.marketCap,
        c.virtualSol, c.virtualTokens, c.tokensLeft,
        toIso(s.graduatedAt), toIso(s.endedAt),
      ]);
      await this.sql`
        update tokens set
          status = v.status::token_status,
          price = v.price::float8,
          ath_price = v.ath::float8,
          market_cap = v.mcap::float8,
          virtual_sol = v.vsol::float8,
          virtual_tokens = v.vtok::float8,
          tokens_left = v.tleft::float8,
          graduated_at = v.grad::timestamptz,
          ended_at = v.ended::timestamptz
        from (values ${this.sql(rows as never)}) as v(id, status, price, ath, mcap, vsol, vtok, tleft, grad, ended)
        where tokens.id = v.id::uuid`;
    }

    for (let i = 0; i < newCandles.length; i += CANDLE_BATCH) {
      const batch = newCandles.slice(i, i + CANDLE_BATCH).map((c) => ({
        tokenId: c.tokenId,
        interval: c.interval,
        ts: new Date(c.time * 1000),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));
      await this.db
        .insert(candles)
        .values(batch)
        .onConflictDoUpdate({
          target: [candles.tokenId, candles.interval, candles.ts],
          set: {
            open: sql`excluded.open`,
            high: sql`excluded.high`,
            low: sql`excluded.low`,
            close: sql`excluded.close`,
            volume: sql`excluded.volume`,
          },
        });
    }
  }

  async recordRug(tokenId: string, at: number): Promise<void> {
    await this.sql`
      insert into rug_victims (user_id, token_id, token_amount, cost_basis_sol, rugged_at)
      select user_id, token_id, token_amount, cost_basis_sol, ${new Date(at).toISOString()}::timestamptz
      from positions where token_id = ${tokenId}::uuid
      on conflict do nothing`;
  }

  /**
   * Samples every player's net worth (SOL + what their positions would sell for) for 24h PnL.
   * The position value is the SQL twin of liquidationValue in packages/sim; tokens that stopped
   * trading keep their last price.
   */
  async snapshotNetWorth(at: number): Promise<void> {
    const sellable = this.sql`least(p.token_amount, ${CURVE.curveTokens} - t.tokens_left)`;
    await this.sql`
      insert into net_worth_snapshots (user_id, at, net_worth_sol)
      select w.user_id, ${new Date(at).toISOString()}::timestamptz,
             w.sol_balance + coalesce(sum(
               case when t.ended_at is null
                 then greatest(0, t.price * t.virtual_tokens * ${sellable} / (t.virtual_tokens + ${sellable}))
                      * ${1 - CURVE.feeBps / 10_000}
                 else p.token_amount * t.price
               end), 0)
      from wallets w
      left join positions p on p.user_id = w.user_id
      left join tokens t on t.id = p.token_id
      group by w.user_id, w.sol_balance
      on conflict do nothing`;
  }

  /**
   * Drops 5s candles and bot trades a day after a token ends, and 1m candles after a week.
   * Net worth snapshots are kept for 48 hours.
   * Player trades are kept for the leaderboard.
   */
  async prune(now: number): Promise<void> {
    const endedBefore = (ms: number) =>
      this.db.select({ id: tokens.id }).from(tokens).where(lt(tokens.endedAt, new Date(now - ms)));
    await this.db
      .delete(candles)
      .where(and(sql`${candles.interval} = 5`, inArray(candles.tokenId, endedBefore(24 * 3600_000))));
    await this.db
      .delete(candles)
      .where(and(sql`${candles.interval} = 60`, inArray(candles.tokenId, endedBefore(7 * 24 * 3600_000))));
    await this.db
      .delete(trades)
      .where(and(isNull(trades.userId), inArray(trades.tokenId, endedBefore(24 * 3600_000))));
    await this.db.delete(netWorthSnapshots).where(lt(netWorthSnapshots.at, new Date(now - 48 * 3600_000)));
  }
}

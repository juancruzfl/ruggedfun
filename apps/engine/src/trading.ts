import { positions, tokens, trades, users, wallets, type Db } from "@ruggedfun/db";
import {
  DEFAULT_SLIPPAGE_BPS,
  MAX_SLIPPAGE_BPS,
  MIN_BUY_SOL,
  type PositionSummary,
  type TradeEvent,
  type TradeRequest,
  type TradeResult,
} from "@ruggedfun/shared";
import { and, eq, sql } from "drizzle-orm";
import { TradeError, type Market } from "./market";

/** Positions smaller than this many tokens are closed. */
const DUST_TOKENS = 1e-6;
/** Float tolerance when comparing balances. */
const EPSILON = 1e-9;

export interface UserTradeRequest extends TradeRequest {
  userId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rejects malformed requests before they reach the market. */
export function parseTradeRequest(body: unknown): UserTradeRequest {
  const b = (body ?? {}) as Record<string, unknown>;
  const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  if (typeof b.userId !== "string" || !UUID.test(b.userId)) throw new TradeError("Invalid user");
  if (typeof b.tokenId !== "string" || !UUID.test(b.tokenId)) throw new TradeError("Invalid token");
  if (b.side !== "buy" && b.side !== "sell") throw new TradeError("Side must be buy or sell");
  if (!isNum(b.amount) || b.amount <= 0) throw new TradeError("Amount must be positive");
  if (b.side === "buy" && b.amount < MIN_BUY_SOL) throw new TradeError(`Minimum buy is ${MIN_BUY_SOL} SOL`);
  if (!isNum(b.expectedPrice) || b.expectedPrice <= 0) throw new TradeError("Missing expected price");
  const slippageBps = b.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  if (!isNum(slippageBps) || slippageBps < 0 || slippageBps > MAX_SLIPPAGE_BPS) {
    throw new TradeError(`Slippage must be between 0 and ${MAX_SLIPPAGE_BPS} bps`);
  }
  return {
    userId: b.userId,
    tokenId: b.tokenId,
    side: b.side,
    amount: b.amount,
    expectedPrice: b.expectedPrice,
    slippageBps,
  };
}

/**
 * Executes player trades one at a time. Each trade is priced against the in-memory curve,
 * written to the database in a single transaction (wallet, position, trade, curve), and only
 * then applied to the live market. Running them serially keeps the curve consistent.
 */
export class Trading {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly market: Market,
    private readonly db: Db,
  ) {}

  execute(request: UserTradeRequest): Promise<TradeResult> {
    const run = this.queue.then(() => this.run(request));
    this.queue = run.catch(() => {});
    return run;
  }

  private async run(req: UserTradeRequest): Promise<TradeResult> {
    const { quote, summary } = this.market.quote(req.tokenId, req.side, req.amount);

    const slippage = (req.slippageBps ?? DEFAULT_SLIPPAGE_BPS) / 10_000;
    const tooExpensive = req.side === "buy" && quote.avgPrice > req.expectedPrice * (1 + slippage);
    const tooCheap = req.side === "sell" && quote.avgPrice < req.expectedPrice * (1 - slippage);
    if (tooExpensive || tooCheap) throw new TradeError("The price moved more than your slippage. Try again.", 409);

    const at = Date.now();
    const result = await this.db.transaction(async (tx) => {
      const [account] = await tx
        .select({ solBalance: wallets.solBalance, username: users.username })
        .from(wallets)
        .innerJoin(users, eq(users.id, wallets.userId))
        .where(eq(wallets.userId, req.userId))
        .for("update", { of: wallets });
      if (!account) throw new TradeError("No wallet for this user", 404);

      const [held] = await tx
        .select({ tokenAmount: positions.tokenAmount, costBasisSol: positions.costBasisSol })
        .from(positions)
        .where(and(eq(positions.userId, req.userId), eq(positions.tokenId, req.tokenId)))
        .for("update");

      let solBalance: number;
      let tokenAmount: number;
      let costBasisSol: number;
      let realizedPnlSol: number | null = null;
      if (req.side === "buy") {
        if (account.solBalance + EPSILON < quote.solAmount) throw new TradeError("Not enough SOL", 409);
        solBalance = Math.max(0, account.solBalance - quote.solAmount);
        tokenAmount = (held?.tokenAmount ?? 0) + quote.tokenAmount;
        costBasisSol = (held?.costBasisSol ?? 0) + quote.solAmount;
      } else {
        if (!held || held.tokenAmount * (1 + EPSILON) < quote.tokenAmount) {
          throw new TradeError("You don't hold that many tokens", 409);
        }
        solBalance = account.solBalance + quote.solAmount;
        tokenAmount = Math.max(0, held.tokenAmount - quote.tokenAmount);
        // Average cost: the sold share of the cost basis goes with the tokens.
        costBasisSol = held.costBasisSol * (tokenAmount / held.tokenAmount);
        realizedPnlSol = quote.solAmount - (held.costBasisSol - costBasisSol);
      }

      await tx.update(wallets).set({ solBalance }).where(eq(wallets.userId, req.userId));

      const closed = tokenAmount < DUST_TOKENS;
      if (closed) {
        await tx.delete(positions).where(and(eq(positions.userId, req.userId), eq(positions.tokenId, req.tokenId)));
      } else {
        await tx
          .insert(positions)
          .values({ userId: req.userId, tokenId: req.tokenId, tokenAmount, costBasisSol })
          .onConflictDoUpdate({
            target: [positions.userId, positions.tokenId],
            set: { tokenAmount, costBasisSol },
          });
      }

      const [row] = await tx
        .insert(trades)
        .values({
          tokenId: req.tokenId,
          userId: req.userId,
          side: req.side,
          solAmount: quote.solAmount,
          tokenAmount: quote.tokenAmount,
          price: quote.avgPrice,
          realizedPnlSol,
          createdAt: new Date(at),
        })
        .returning({ id: trades.id });

      // Persist the curve with the trade, so a crash before the next flush can't lose it.
      await tx
        .update(tokens)
        .set({
          virtualSol: quote.curve.virtualSol,
          virtualTokens: quote.curve.virtualTokens,
          tokensLeft: quote.curve.tokensLeft,
          price: quote.priceAfter,
          athPrice: sql`greatest(${tokens.athPrice}, ${quote.priceAfter})`,
        })
        .where(eq(tokens.id, req.tokenId));

      const position: PositionSummary | null = closed
        ? null
        : {
            tokenId: summary.id,
            ticker: summary.ticker,
            name: summary.name,
            imageUrl: summary.imageUrl,
            tokenAmount,
            costBasisSol,
            lastPrice: quote.priceAfter,
          };
      const trade: TradeEvent = {
        id: row!.id,
        tokenId: summary.id,
        ticker: summary.ticker,
        name: summary.name,
        imageUrl: summary.imageUrl,
        side: req.side,
        solAmount: quote.solAmount,
        tokenAmount: quote.tokenAmount,
        price: quote.avgPrice,
        trader: account.username,
        isBot: false,
        isDev: false,
        realizedPnlSol,
        at,
        priceAfter: quote.priceAfter,
        curve: quote.curve,
      };
      return { trade, solBalance, position };
    });

    this.market.commitTrade(result.trade, quote);
    return result;
  }
}

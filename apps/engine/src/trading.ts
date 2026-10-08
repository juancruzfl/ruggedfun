import { positions, tokens, trades, users, wallets, type Db } from "@ruggedfun/db";
import {
  avatarUrl,
  DEFAULT_SLIPPAGE_BPS,
  LAUNCH_COST_SOL,
  LAUNCHES_PER_HOUR,
  MAX_SLIPPAGE_BPS,
  MIN_BUY_SOL,
  normalizeTicker,
  validateLaunch,
  type LaunchRequest,
  type LaunchResult,
  type PositionSummary,
  type TradeEvent,
  type TradeRequest,
  type TradeResult,
} from "@ruggedfun/shared";
import { and, count, eq, gt, sql } from "drizzle-orm";
import { TickerTakenError, TradeError, type Market } from "./market";

/** Chance a trade lands during "congestion" and takes 2–3x longer to confirm, like a busy network. */
const CONGESTION_CHANCE = 0.05;

/**
 * How long a trade waits before it's filled, in ms: uniform between `min` and `max`, sometimes
 * longer. Real Solana trades confirm in ~0.4–2s, and the price keeps moving in the meantime.
 * 0 / 0 turns the delay off.
 */
export function confirmationDelayMs(min: number, max: number, random: () => number = Math.random): number {
  if (max <= 0) return 0;
  const base = min + (max - min) * random();
  return random() < CONGESTION_CHANCE ? base * (2 + random()) : base;
}

/** Positions smaller than this many tokens are closed. */
const DUST_TOKENS = 1e-6;
/** Float tolerance when comparing balances. */
const EPSILON = 1e-9;

export interface UserTradeRequest extends TradeRequest {
  userId: string;
}

export interface UserLaunchRequest extends LaunchRequest {
  userId: string;
}

/** Rejects malformed launches; the field rules are shared with the launch form. */
export function parseLaunchRequest(body: unknown): UserLaunchRequest {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.userId !== "string" || !UUID.test(b.userId)) throw new TradeError("Invalid user");
  const req = {
    name: typeof b.name === "string" ? b.name.trim() : "",
    ticker: typeof b.ticker === "string" ? normalizeTicker(b.ticker) : "",
    description: typeof b.description === "string" ? b.description.trim() : "",
    avatarStyle: b.avatarStyle as LaunchRequest["avatarStyle"],
    avatarSeed: typeof b.avatarSeed === "string" ? b.avatarSeed : "",
    devBuySol: typeof b.devBuySol === "number" ? b.devBuySol : 0,
  };
  const errors = Object.values(validateLaunch(req));
  if (errors.length > 0) throw new TradeError(errors[0]!);
  return { ...req, userId: b.userId };
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
 * Executes player trades one at a time. Each trade waits out a simulated confirmation delay, then
 * is priced against the in-memory curve, written to the database in a single transaction (wallet,
 * position, trade, curve), and only then applied to the live market. Running the fills serially
 * keeps the curve consistent.
 */
export class Trading {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly market: Market,
    private readonly db: Db,
    /** Simulated confirmation time per trade, in ms (see confirmationDelayMs). None by default. */
    private readonly confirmationDelay: () => number = () => 0,
  ) {}

  async execute(request: UserTradeRequest): Promise<TradeResult> {
    // Fail fast on trades that can't happen at all (token stopped, nothing to sell...).
    this.market.quote(request.tokenId, request.side, request.amount);
    // Wait outside the queue, so one player's confirmation doesn't hold up everyone else's fills.
    // The fill is priced when the wait ends, so the price can move (and the slippage check matter).
    const delay = this.confirmationDelay();
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    return this.enqueue(() => this.run(request));
  }

  /** Launches go through the same queue as trades, so a dev buy can't interleave with other fills. */
  launch(request: UserLaunchRequest): Promise<LaunchResult> {
    return this.enqueue(() => this.runLaunch(request));
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task);
    this.queue = run.catch(() => {});
    return run;
  }

  /**
   * Charges the launch cost, creates the token (fate rolled like any other, hidden from the
   * creator), then runs the optional dev buy as a normal player trade. If the ticker turns out to
   * be taken, the cost is refunded.
   */
  private async runLaunch(req: UserLaunchRequest): Promise<LaunchResult> {
    const [taken] = await this.db.select({ id: tokens.id }).from(tokens).where(eq(tokens.ticker, req.ticker)).limit(1);
    if (taken) throw new TradeError(`$${req.ticker} is already taken`, 409);

    const username = await this.db.transaction(async (tx) => {
      const [account] = await tx
        .select({ solBalance: wallets.solBalance, username: users.username })
        .from(wallets)
        .innerJoin(users, eq(users.id, wallets.userId))
        .where(eq(wallets.userId, req.userId))
        .for("update", { of: wallets });
      if (!account) throw new TradeError("No wallet for this user", 404);

      const [recent] = await tx
        .select({ n: count() })
        .from(tokens)
        .where(and(eq(tokens.creatorUserId, req.userId), gt(tokens.createdAt, new Date(Date.now() - 3600_000))));
      if ((recent?.n ?? 0) >= LAUNCHES_PER_HOUR) {
        throw new TradeError(`You can launch ${LAUNCHES_PER_HOUR} tokens an hour. Try again later.`, 429);
      }
      if (account.solBalance + EPSILON < LAUNCH_COST_SOL + req.devBuySol) {
        throw new TradeError(`Not enough SOL: launching costs ${LAUNCH_COST_SOL} SOL plus your dev buy`, 409);
      }
      await tx
        .update(wallets)
        .set({ solBalance: account.solBalance - LAUNCH_COST_SOL })
        .where(eq(wallets.userId, req.userId));
      return account.username;
    });

    let token;
    try {
      token = await this.market.launch(Date.now(), {
        player: {
          userId: req.userId,
          username,
          name: req.name,
          ticker: req.ticker,
          description: req.description,
          imageUrl: avatarUrl(req.avatarStyle, req.avatarSeed),
        },
      });
    } catch (err) {
      await this.db
        .update(wallets)
        .set({ solBalance: sql`${wallets.solBalance} + ${LAUNCH_COST_SOL}` })
        .where(eq(wallets.userId, req.userId));
      if (err instanceof TickerTakenError) throw new TradeError(`$${req.ticker} is already taken`, 409);
      throw err;
    }

    if (req.devBuySol > 0) {
      const { quote } = this.market.quote(token.id, "buy", req.devBuySol);
      const bought = await this.run({
        userId: req.userId,
        tokenId: token.id,
        side: "buy",
        amount: req.devBuySol,
        expectedPrice: quote.avgPrice,
      });
      return {
        token: this.market.summaries().find((t) => t.id === token.id) ?? token,
        solBalance: bought.solBalance,
        position: bought.position,
      };
    }

    const [wallet] = await this.db
      .select({ solBalance: wallets.solBalance })
      .from(wallets)
      .where(eq(wallets.userId, req.userId));
    return { token, solBalance: wallet?.solBalance ?? 0, position: null };
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
        // A player trading the token they launched is its dev.
        isDev: summary.byPlayer && account.username === summary.creatorHandle,
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

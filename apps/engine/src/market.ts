import {
  CANDLE_INTERVALS,
  SPARKLINE_POINTS,
  SPARKLINE_SAMPLE_SECONDS,
  type Callout,
  type Candle,
  type MarketSnapshot,
  type MarketToken,
  type PriceTick,
  type TokenStatusChange,
  type TokenSummary,
  type TradeEvent,
} from "@ruggedfun/shared";
import {
  bondingProgress,
  createRng,
  GRADUATION_PRICE,
  initialCurve,
  LAUNCH_PRICE,
  marketCapSol,
  quoteTrade,
  randomSeed,
  spotPrice,
  TICK_SECONDS,
  TokenSim,
  tokensSold,
  type CurveState,
  type Fate,
  type TradeQuote,
  type TradeSide,
} from "@ruggedfun/sim";
import { BotFlow, type BotOrder } from "./bots";
import { CandleBuilder } from "./candles";
import { generateTokenMeta } from "./names";

export interface MarketEvents {
  launched(token: MarketToken): void;
  ticks(ticks: PriceTick[]): void;
  status(change: TokenStatusChange): void;
  candle(candle: Candle): void;
  callout(callout: Callout): void;
  trade(trade: TradeEvent): void;
  /** Whether anyone is watching this token's chart. Candles are only emitted if so. */
  wantsCandles(tokenId: string): boolean;
}

/** Server-side token state. `seed` and `fate` must never be sent to clients. */
export interface StoredToken {
  summary: TokenSummary;
  seed: string;
  fate: Fate;
  curve: CurveState;
}

export interface MarketStore {
  /** Throws TickerTakenError if the ticker is already used. */
  insertToken(token: StoredToken): Promise<void>;
  /** Tokens that haven't ended yet. */
  loadLive(): Promise<StoredToken[]>;
  /** `trades` are bot trades; player trades are written by the trade transaction. */
  save(tokens: StoredToken[], candles: Candle[], trades: TradeEvent[]): Promise<void>;
  /** Records every player holding the token as a rug victim. Idempotent. */
  recordRug(tokenId: string, at: number): Promise<void>;
}

export class TickerTakenError extends Error {}

/** A trade the market refuses. `status` is the HTTP status to answer with. */
export class TradeError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

interface LiveToken extends StoredToken {
  sim: TokenSim;
  candles: CandleBuilder[];
  /** Prices sampled every SPARKLINE_SAMPLE_SECONDS, for sparklines and 5m change. */
  history: number[];
  /** The last few per-tick prices, for the bots' short-term momentum. */
  recentPrices: number[];
  /** Trades in the last 5 minutes (time, SOL), for volume5m. */
  flow: { at: number; sol: number }[];
  devBought: boolean;
  nextPumpCallout: number;
  dirty: boolean;
}

interface AdvanceOptions {
  /** Suppress events (restoring or backdating, when nobody needs to hear about the past). */
  quiet?: boolean;
  /** Skip building candles for ticks before this time (unix ms). */
  candlesSince?: number;
}

const TICK_MS = TICK_SECONDS * 1000;
const PUMP_CALLOUT_MULTIPLES = [5, 10, 25, 50, 100, 1000];
/** How much chart history to rebuild for tokens restored after an engine restart. */
const RESTORE_CANDLE_WINDOW_MS = 10 * 60 * 1000;
const SAMPLE_TICKS = SPARKLINE_SAMPLE_SECONDS / TICK_SECONDS;
const RECENT_CALLOUTS = 20;
const RECENT_PRICE_TICKS = 6;
const VOLUME_WINDOW_MS = 5 * 60_000;
/** Bot buys this big make the hot ticker. */
const WHALE_SOL = 5;
/** Player buys this big make the hot ticker. */
const PLAYER_CALLOUT_SOL = 0.5;
/** Player profits this big make the hot ticker. */
const WIN_CALLOUT_SOL = 0.5;

/** The token's own clock: the time of its latest tick. */
const tokenTime = (token: LiveToken) => token.summary.createdAt + token.sim.tick * TICK_MS;

function volume5m(token: LiveToken): number {
  const cutoff = tokenTime(token) - VOLUME_WINDOW_MS;
  while (token.flow.length > 0 && token.flow[0]!.at < cutoff) token.flow.shift();
  return token.flow.reduce((sum, f) => sum + f.sol, 0);
}

function toMarketToken(token: LiveToken): MarketToken {
  return {
    ...token.summary,
    curve: { ...token.curve },
    change5m: token.summary.price / token.history[0]! - 1,
    sparkline: [...token.history],
    volume5m: volume5m(token),
  };
}

function toTick(token: LiveToken): PriceTick {
  const { id, price, marketCap, bondingProgress, change5m, volume5m } = toMarketToken(token);
  return { id, price, marketCap, bondingProgress, change5m, volume5m };
}

/**
 * Every token that is still trading, advanced against the wall clock.
 * A token's price = its fate multiple × its bonding-curve spot price, so player trades
 * (which move the curve) stack on top of the fate path.
 */
export class Market {
  private readonly live = new Map<string, LiveToken>();
  private readonly recentCallouts: Callout[] = [];
  /** Bot trades waiting for the next flush. */
  private pendingTrades: TradeEvent[] = [];
  private readonly bots: BotFlow | null;

  constructor(
    private readonly store: MarketStore,
    private readonly events: MarketEvents,
    options: { bots?: BotFlow } = {},
  ) {
    this.bots = options.bots ?? null;
  }

  get size(): number {
    return this.live.size;
  }

  summaries(): MarketToken[] {
    return [...this.live.values()].map(toMarketToken);
  }

  snapshot(): MarketSnapshot {
    return { tokens: this.summaries(), callouts: [...this.recentCallouts] };
  }

  async restore(now: number): Promise<void> {
    for (const stored of await this.store.loadLive()) {
      const token = this.track(stored, new TokenSim(stored.seed, { fate: stored.fate }));
      this.advance(token, now, { quiet: true, candlesSince: now - RESTORE_CANDLE_WINDOW_MS });
    }
  }

  async launch(now: number, options: { fate?: Fate; backdateMs?: number } = {}): Promise<MarketToken> {
    const seed = randomSeed();
    const sim = new TokenSim(seed, { fate: options.fate });
    const metaRng = createRng(`${seed}:meta`);
    const createdAt = now - (options.backdateMs ?? 0);
    const curve = initialCurve();

    for (let attempt = 0; attempt < 5; attempt++) {
      const meta = generateTokenMeta(metaRng, attempt);
      const price = sim.multiple * spotPrice(curve);
      const summary: TokenSummary = {
        id: crypto.randomUUID(),
        ...meta,
        status: "live",
        price,
        marketCap: marketCapSol(price),
        athPrice: price,
        bondingProgress: bondingProgress(price),
        createdAt,
        graduatedAt: null,
        endedAt: null,
      };
      try {
        await this.store.insertToken({ summary, seed, fate: sim.fate, curve });
      } catch (err) {
        if (err instanceof TickerTakenError) continue;
        throw err;
      }

      const token = this.track({ summary, seed, fate: sim.fate, curve }, sim);
      if (options.backdateMs) {
        this.advance(token, now, { quiet: true });
      } else {
        token.devBought = false;
        this.events.launched(toMarketToken(token));
      }
      return toMarketToken(token);
    }
    throw new Error("Could not find a free ticker after 5 attempts");
  }

  /** Advances every token to `now`, runs a second of bot trading, and broadcasts the changes. */
  tick(now: number): void {
    const changed: LiveToken[] = [];
    for (const token of this.live.values()) {
      if (this.advance(token, now)) changed.push(token);
    }
    this.runBots(now);
    if (changed.length > 0) this.events.ticks(changed.map(toTick));
  }

  /** Prices a trade at the current tick without applying it. Throws TradeError if it isn't allowed. */
  quote(tokenId: string, side: TradeSide, amount: number): { quote: TradeQuote; summary: TokenSummary } {
    const token = this.live.get(tokenId);
    if (!token || token.summary.endedAt !== null) throw new TradeError("This token has stopped trading", 409);
    const { summary, curve, sim } = token;

    if (side === "buy") {
      if (summary.status === "rugged" || summary.status === "dead") {
        throw new TradeError("This token was rugged. Buying is disabled.", 409);
      }
      if (curve.tokensLeft <= 0) throw new TradeError("The bonding curve is complete", 409);
    } else {
      // Float drift can leave a holder a hair above what the curve has sold.
      amount = Math.min(amount, tokensSold(curve));
      if (!(amount > 0)) throw new TradeError("Nothing to sell", 409);
    }

    try {
      return { quote: quoteTrade(curve, sim.multiple, side, amount), summary: { ...summary } };
    } catch (err) {
      throw new TradeError(err instanceof Error ? err.message : "Trade rejected");
    }
  }

  /**
   * Applies a trade that has already been persisted: moves the curve, reprices the token
   * and broadcasts the trade. The token may have ended since it was quoted; that's fine.
   */
  commitTrade(trade: TradeEvent, quote: TradeQuote): void {
    const token = this.live.get(trade.tokenId);
    if (!token) return;
    token.curve = { ...quote.curve };
    const price = token.sim.multiple * spotPrice(token.curve);
    this.setPrice(token, price, trade.at);
    // Already persisted by the trade transaction.
    this.recordTrade(token, trade, { persist: false });
    this.events.ticks([toTick(token)]);
  }

  /** Persists changed tokens and candles. Tokens that have ended stop being tracked. */
  async flush(): Promise<void> {
    const dirty = [...this.live.values()].filter((t) => t.dirty);
    if (dirty.length === 0 && this.pendingTrades.length === 0) return;
    for (const token of dirty) token.dirty = false;
    const candles = dirty.flatMap((t) => t.candles.flatMap((b) => b.drain()));
    const trades = this.pendingTrades;
    this.pendingTrades = [];

    try {
      await this.store.save(
        dirty.map(({ summary, seed, fate, curve }) => ({ summary: { ...summary }, seed, fate, curve: { ...curve } })),
        candles,
        trades,
      );
    } catch (err) {
      for (const token of dirty) token.dirty = true;
      this.pendingTrades = [...trades, ...this.pendingTrades];
      throw err;
    }
    for (const token of dirty) {
      if (token.summary.endedAt !== null) this.live.delete(token.summary.id);
    }
  }

  private track(stored: StoredToken, sim: TokenSim): LiveToken {
    const id = stored.summary.id;
    const multiple = stored.summary.athPrice / LAUNCH_PRICE;
    const token: LiveToken = {
      ...stored,
      sim,
      candles: CANDLE_INTERVALS.map((interval) => new CandleBuilder(id, interval)),
      // The sim is fresh (tick 0), so this is the launch price; restores replay history from there.
      history: [sim.multiple * spotPrice(stored.curve)],
      recentPrices: [sim.multiple * spotPrice(stored.curve)],
      flow: [],
      // Only a fresh launch gets a dev buy (see launch); restored and backdated tokens don't.
      devBought: true,
      nextPumpCallout: PUMP_CALLOUT_MULTIPLES.findIndex((m) => m > multiple),
      dirty: false,
    };
    this.live.set(id, token);
    return token;
  }

  /** Steps the token's sim up to `now`. Returns whether anything changed. */
  private advance(token: LiveToken, now: number, options: AdvanceOptions = {}): boolean {
    const { sim, summary } = token;
    const target = Math.min(sim.plan.endTick, Math.floor((now - summary.createdAt) / TICK_MS));
    if (sim.tick >= target) return false;

    while (sim.tick < target) {
      const price = sim.step() * spotPrice(token.curve);
      const at = summary.createdAt + sim.tick * TICK_MS;
      if (sim.tick % SAMPLE_TICKS === 0) {
        token.history.push(price);
        if (token.history.length > SPARKLINE_POINTS) token.history.shift();
      }
      token.recentPrices.push(price);
      if (token.recentPrices.length > RECENT_PRICE_TICKS) token.recentPrices.shift();
      this.setPrice(token, price, at, {
        quiet: options.quiet,
        candles: at >= (options.candlesSince ?? -Infinity),
      });
      this.checkLifecycle(token, at, options.quiet ?? false);
    }
    token.dirty = true;
    return true;
  }

  private runBots(now: number): void {
    if (!this.bots) return;
    const views = [];
    for (const token of this.live.values()) {
      const { summary } = token;
      if (summary.endedAt !== null) continue;
      if (!token.devBought) {
        token.devBought = true;
        if (summary.status === "live") this.fillBotOrder(token, this.bots.devBuy(summary.id, summary.creatorHandle));
      }
      views.push({
        id: summary.id,
        status: summary.status,
        marketCap: summary.marketCap,
        createdAt: summary.createdAt,
        recentReturn: summary.price / token.recentPrices[0]! - 1,
      });
    }
    for (const order of this.bots.ordersFor(views, now)) {
      const token = this.live.get(order.tokenId);
      if (token) this.fillBotOrder(token, order);
    }
  }

  /** Records a bot trade at the current price (or `price`). Bots never move the curve. */
  private fillBotOrder(token: LiveToken, order: BotOrder, price = token.summary.price): void {
    const { summary } = token;
    this.recordTrade(
      token,
      {
        id: crypto.randomUUID(),
        tokenId: summary.id,
        ticker: summary.ticker,
        name: summary.name,
        imageUrl: summary.imageUrl,
        side: order.side,
        solAmount: order.solAmount,
        tokenAmount: order.solAmount / price,
        price,
        trader: order.trader,
        isBot: true,
        isDev: order.trader === summary.creatorHandle,
        realizedPnlSol: null,
        at: tokenTime(token),
        priceAfter: summary.price,
        curve: { ...token.curve },
      },
      { persist: true },
    );
  }

  /** Adds a trade to volume and candles, broadcasts it, and calls out the big ones. */
  private recordTrade(token: LiveToken, trade: TradeEvent, options: { persist: boolean }): void {
    const { summary } = token;
    token.flow.push({ at: trade.at, sol: trade.solAmount });
    const emit = this.events.wantsCandles(summary.id);
    for (const builder of token.candles) {
      const candle = builder.add(trade.at, summary.price, trade.solAmount);
      if (emit) this.events.candle(candle);
    }
    token.dirty = true;
    if (options.persist) this.pendingTrades.push(trade);
    this.events.trade(trade);

    const sol = trade.solAmount < 10 ? trade.solAmount.toFixed(1) : trade.solAmount.toFixed(0);
    if (trade.side === "buy" && !trade.isDev) {
      if (trade.isBot && trade.solAmount >= WHALE_SOL) {
        this.callout(token, "whale", `🐋 ${trade.trader} aped ${sol} SOL into $${summary.ticker}`, trade.at, false);
      } else if (!trade.isBot && trade.solAmount >= PLAYER_CALLOUT_SOL) {
        this.callout(token, "whale", `👤 ${trade.trader} aped ${sol} SOL into $${summary.ticker}`, trade.at, false);
      }
    }
    if (trade.realizedPnlSol !== null && trade.realizedPnlSol >= WIN_CALLOUT_SOL) {
      const multiple = trade.solAmount / (trade.solAmount - trade.realizedPnlSol);
      this.callout(
        token,
        "win",
        `💰 ${trade.trader} took +${trade.realizedPnlSol.toFixed(2)} SOL on $${summary.ticker} (${multiple.toFixed(1)}x)`,
        trade.at,
        false,
      );
    }
  }

  /** Updates price-derived fields and candles, and fires graduation / pump milestones. */
  private setPrice(
    token: LiveToken,
    price: number,
    at: number,
    options: { quiet?: boolean; candles?: boolean; volume?: number } = {},
  ): void {
    const { summary } = token;
    summary.price = price;
    summary.marketCap = marketCapSol(price);
    summary.athPrice = Math.max(summary.athPrice, price);
    summary.bondingProgress = bondingProgress(price);

    if (options.candles ?? true) {
      const emit = !options.quiet && this.events.wantsCandles(summary.id);
      for (const builder of token.candles) {
        const candle = builder.add(at, price, options.volume ?? 0);
        if (emit) this.events.candle(candle);
      }
    }
    this.checkPriceMilestones(token, at, options.quiet ?? false);
  }

  private callout(token: LiveToken, kind: Callout["kind"], text: string, at: number, quiet: boolean): void {
    if (quiet) return;
    const item: Callout = { kind, tokenId: token.summary.id, ticker: token.summary.ticker, text, at };
    this.recentCallouts.push(item);
    if (this.recentCallouts.length > RECENT_CALLOUTS) this.recentCallouts.shift();
    this.events.callout(item);
  }

  private statusChanged(token: LiveToken, quiet: boolean): void {
    const { id, status, endedAt } = token.summary;
    if (!quiet) this.events.status({ id, status, endedAt });
  }

  private checkPriceMilestones(token: LiveToken, at: number, quiet: boolean): void {
    const { summary } = token;
    if (summary.status === "live" && summary.price >= GRADUATION_PRICE) {
      summary.status = "graduated";
      summary.graduatedAt = at;
      this.callout(token, "graduated", `🎓 $${summary.ticker} graduated!`, at, quiet);
      this.statusChanged(token, quiet);
    }

    const multiple = summary.price / LAUNCH_PRICE;
    let reached = -1;
    while (token.nextPumpCallout !== -1 && multiple >= PUMP_CALLOUT_MULTIPLES[token.nextPumpCallout]!) {
      reached = PUMP_CALLOUT_MULTIPLES[token.nextPumpCallout]!;
      token.nextPumpCallout = token.nextPumpCallout + 1 < PUMP_CALLOUT_MULTIPLES.length ? token.nextPumpCallout + 1 : -1;
    }
    if (reached !== -1) this.callout(token, "pump", `🚀 $${summary.ticker} just hit ${reached}x`, at, quiet);
  }

  /** Rug and end of life. Driven by the sim clock only, never by trades. */
  private checkLifecycle(token: LiveToken, at: number, quiet: boolean): void {
    const { sim, summary } = token;
    if (sim.tick === sim.plan.rugTick && summary.status === "live") {
      summary.status = "rugged";
      const drop = Math.min(99, Math.floor((1 - summary.price / summary.athPrice) * 100));
      this.callout(token, "rug", `💀 $${summary.ticker} RUGGED -${drop}%`, at, quiet);
      this.statusChanged(token, quiet);
      // Even when replaying quietly after a restart: holders still got rugged.
      this.store.recordRug(summary.id, at).catch((err) => console.error("recording rug victims failed", err));
      if (!quiet && this.bots) {
        // The creator sells at the top; that sell is the rug. Priced at the last pre-rug tick.
        const preRugPrice = token.recentPrices.at(-2) ?? summary.price;
        const ath = marketCapSol(summary.athPrice);
        this.fillBotOrder(token, this.bots.devDump(summary.id, summary.creatorHandle, ath), preRugPrice);
      }
    }

    if (sim.done) {
      if (summary.status === "live") summary.status = sim.plan.endStatus;
      summary.endedAt = at;
      this.statusChanged(token, quiet);
    }
  }
}

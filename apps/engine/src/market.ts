import {
  CANDLE_INTERVALS,
  HOUSE_TOKEN,
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
  flowForMove,
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
  type SimFate,
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
  /** The player who launched it, if any. */
  creatorUserId?: string | null;
  seed: string;
  fate: SimFate;
  curve: CurveState;
}

export interface MarketStore {
  /** Throws TickerTakenError if the ticker is already used. */
  insertToken(token: StoredToken): Promise<void>;
  /** Tokens that haven't ended yet. */
  loadLive(): Promise<StoredToken[]>;
  /** The newest stored candle for each of the given tokens and each interval. */
  loadLatestCandles(tokenIds: string[]): Promise<Candle[]>;
  /** Each bot's net token holdings (buys minus sells), per token, for the given tokens. */
  loadBotHoldings(tokenIds: string[]): Promise<Map<string, Map<string, number>>>;
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
  /**
   * The multiple behind the displayed price (price = displayMultiple × spotPrice(curve)).
   * It only moves when a trade happens; bot trades pull it to the fate path's multiple.
   */
  displayMultiple: number;
  /** What each bot holds of this token; bots can only sell what they bought. */
  botHoldings: Map<string, number>;
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
/** A gap this big between the displayed price and the fate path forces a bot trade to close it... */
const FORCE_SYNC_DRIFT = 0.05;
/**
 * ...but at most this many forced trades per second across the market, biggest gaps first.
 * Quiet tokens lag their path a little longer, like illiquid tokens do. Rugs aren't counted.
 */
const FORCED_SYNCS_PER_SECOND = 6;
/** Below this gap a bot trade is plain flow and doesn't move the price. */
const MOVE_DRIFT = 0.005;
/** Bot bags smaller than this many tokens are dropped. */
const DUST_TOKENS = 1;
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

const driftOf = (token: LiveToken) => token.sim.multiple / token.displayMultiple - 1;

/**
 * Every token that is still trading, advanced against the wall clock.
 * Each token's fate path sets a target multiple every second, but the displayed price
 * (displayMultiple × bonding-curve spot price) only moves when someone trades: bot trades pull it
 * to the target, sized by the move, and player trades move the curve. No trade, no price change.
 */
export class Market {
  private readonly live = new Map<string, LiveToken>();
  private readonly recentCallouts: Callout[] = [];
  /** Bot trades waiting for the next flush. */
  private pendingTrades: TradeEvent[] = [];
  /** Tokens whose displayed price moved since the last tick broadcast. */
  private readonly moved = new Set<LiveToken>();
  private readonly bots: BotFlow;

  constructor(
    private readonly store: MarketStore,
    private readonly events: MarketEvents,
    options: { bots?: BotFlow } = {},
  ) {
    // Without a configured flow there's still a market: forced trades keep prices on their fate paths.
    this.bots = options.bots ?? new BotFlow(0);
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
    const stored = await this.store.loadLive();
    const ids = stored.map((s) => s.summary.id);
    const holdings = await this.store.loadBotHoldings(ids);
    const latest = new Map<string, Candle>();
    for (const c of await this.store.loadLatestCandles(ids)) latest.set(`${c.tokenId}:${c.interval}`, c);
    const candlesSince = now - RESTORE_CANDLE_WINDOW_MS;
    for (const s of stored) {
      // The house token never ends, so replaying it from launch would take longer every restart.
      // It picks up from its saved price instead; everything else replays its fate path.
      const sim =
        s.fate === "house"
          ? new TokenSim(s.seed, {
              fate: "house",
              resume: {
                tick: Math.floor((now - s.summary.createdAt) / TICK_MS),
                multiple: s.summary.price / spotPrice(s.curve),
              },
            })
          : new TokenSim(s.seed, { fate: s.fate });
      const token = this.track(s, sim);
      token.botHoldings = holdings.get(s.summary.id) ?? new Map();
      // The replay below only rebuilds candles from the last few minutes. A candle that started earlier
      // (a 1d candle, or anything for the house token, which doesn't replay) carries on from what was
      // stored instead of being rebuilt from those minutes alone.
      for (const builder of token.candles) {
        const candle = latest.get(`${s.summary.id}:${builder.interval}`);
        if (candle && (s.fate === "house" || candle.time * 1000 < candlesSince)) builder.seed(candle);
      }
      this.advance(token, now, { quiet: true, candlesSince });
    }
  }

  /**
   * Launches a token. Market launches get generated names (retrying ticker collisions) and a bot
   * dev buy; a player launch uses the player's name, ticker and image and throws TickerTakenError
   * if the ticker is taken. Either way the fate is rolled the same way, hidden from everyone.
   * `house` launches $RUGGEDFUN instead (see ensureHouseToken).
   */
  async launch(
    now: number,
    options: {
      fate?: Fate;
      backdateMs?: number;
      house?: boolean;
      player?: {
        userId: string;
        username: string;
        name: string;
        ticker: string;
        description: string;
        imageUrl: string;
      };
    } = {},
  ): Promise<MarketToken> {
    const seed = randomSeed();
    const house = options.house === true;
    const sim = new TokenSim(seed, { fate: house ? "house" : options.fate });
    const metaRng = createRng(`${seed}:meta`);
    const createdAt = now - (options.backdateMs ?? 0);
    const curve = initialCurve();

    const player = options.player;
    for (let attempt = 0; attempt < (player || house ? 1 : 5); attempt++) {
      const meta = house
        ? { ...HOUSE_TOKEN }
        : player
          ? {
              name: player.name,
              ticker: player.ticker,
              description: player.description,
              imageUrl: player.imageUrl,
              creatorHandle: player.username,
            }
          : generateTokenMeta(metaRng, attempt);
      const price = sim.multiple * spotPrice(curve);
      const summary: TokenSummary = {
        id: crypto.randomUUID(),
        ...meta,
        byPlayer: Boolean(player),
        status: "live",
        price,
        marketCap: marketCapSol(price),
        athPrice: price,
        bondingProgress: bondingProgress(price),
        createdAt,
        graduatedAt: null,
        endedAt: null,
      };
      const creatorUserId = player?.userId ?? null;
      try {
        await this.store.insertToken({ summary, seed, fate: sim.fate, curve, creatorUserId });
      } catch (err) {
        if (err instanceof TickerTakenError && !player && !house) continue;
        throw err;
      }

      const token = this.track({ summary, seed, fate: sim.fate, curve, creatorUserId }, sim);
      if (options.backdateMs) {
        this.advance(token, now, { quiet: true });
      } else {
        // Market launches get a bot dev buy; a player makes their own (or doesn't). The house doesn't.
        token.devBought = Boolean(player) || house;
        this.events.launched(toMarketToken(token));
        if (player) {
          this.callout(token, "launch", `🆕 ${player.username} launched $${summary.ticker}`, createdAt, false);
        }
      }
      return toMarketToken(token);
    }
    throw new Error("Could not find a free ticker after 5 attempts");
  }

  /**
   * Launches $RUGGEDFUN if it isn't trading yet; returns it if it was launched, null if it already was.
   * Throws TickerTakenError if another token already has its ticker.
   */
  async ensureHouseToken(now: number): Promise<MarketToken | null> {
    for (const token of this.live.values()) if (token.fate === "house") return null;
    return this.launch(now, { house: true });
  }

  /** Advances every token to `now`, runs a second of bot trading, and broadcasts prices that moved. */
  tick(now: number): void {
    for (const token of this.live.values()) this.advance(token, now);
    this.runBots(now);
    if (this.moved.size > 0) this.events.ticks([...this.moved].map(toTick));
    this.moved.clear();
  }

  /** Prices a trade at the current tick without applying it. Throws TradeError if it isn't allowed. */
  quote(tokenId: string, side: TradeSide, amount: number): { quote: TradeQuote; summary: TokenSummary } {
    const token = this.live.get(tokenId);
    if (!token || token.summary.endedAt !== null) throw new TradeError("This token has stopped trading", 409);
    const { summary, curve } = token;
    // The house token never graduates, so its curve never runs out.
    const uncapped = token.fate === "house";

    if (side === "buy") {
      if (summary.status === "rugged" || summary.status === "dead") {
        throw new TradeError("This token was rugged. Buying is disabled.", 409);
      }
      if (!uncapped && curve.tokensLeft <= 0) throw new TradeError("The bonding curve is complete", 409);
    } else {
      // Float drift can leave a holder a hair above what the curve has sold.
      amount = Math.min(amount, tokensSold(curve));
      if (!(amount > 0)) throw new TradeError("Nothing to sell", 409);
    }

    try {
      // At the displayed price: exactly what the browser quoted from the price and curve it was sent.
      return { quote: quoteTrade(curve, token.displayMultiple, side, amount, { uncapped }), summary: { ...summary } };
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
    this.setPrice(token, trade.at);
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
      displayMultiple: sim.multiple,
      botHoldings: new Map(),
      flow: [],
      // Only a fresh launch gets a dev buy (see launch); restored and backdated tokens don't.
      devBought: true,
      nextPumpCallout: PUMP_CALLOUT_MULTIPLES.findIndex((m) => m > multiple),
      dirty: false,
    };
    this.live.set(id, token);
    return token;
  }

  /**
   * Steps the token's fate path up to `now`. Live, that only moves the target; the displayed
   * price waits for a trade. When replaying quietly (restore, backdated launch) nobody was there
   * to trade, so the displayed price simply follows the path.
   */
  private advance(token: LiveToken, now: number, options: AdvanceOptions = {}): void {
    const { sim, summary } = token;
    const target = Math.min(sim.plan.endTick, Math.floor((now - summary.createdAt) / TICK_MS));

    while (sim.tick < target) {
      sim.step();
      const at = summary.createdAt + sim.tick * TICK_MS;
      if (options.quiet) {
        token.displayMultiple = sim.multiple;
        this.setPrice(token, at, { quiet: true, candles: at >= (options.candlesSince ?? -Infinity) });
      }
      if (sim.tick % SAMPLE_TICKS === 0) {
        token.history.push(summary.price);
        if (token.history.length > SPARKLINE_POINTS) token.history.shift();
      }
      this.checkLifecycle(token, at, options.quiet ?? false);
    }
  }

  /**
   * One second of bot trading: the creator's launch buy, random flow (BotFlow), and a forced trade
   * for any token whose displayed price has drifted 5%+ from its fate path.
   */
  private runBots(now: number): void {
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
        recentReturn: driftOf(token),
      });
    }

    const traded = new Set<string>();
    for (const order of this.bots.ordersFor(views, now)) {
      const token = this.live.get(order.tokenId);
      if (!token) continue;
      this.fillBotOrder(token, order);
      traded.add(order.tokenId);
    }
    const behind: { token: LiveToken; drift: number }[] = [];
    for (const token of this.live.values()) {
      if (token.summary.endedAt !== null || traded.has(token.summary.id)) continue;
      const drift = driftOf(token);
      if (Math.abs(drift) < FORCE_SYNC_DRIFT || (token.summary.status === "rugged" && drift > 0)) continue;
      behind.push({ token, drift });
    }
    behind.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
    for (const { token, drift } of behind.slice(0, FORCED_SYNCS_PER_SECOND)) {
      this.fillBotOrder(token, {
        tokenId: token.summary.id,
        side: drift > 0 ? "buy" : "sell",
        solAmount: 0,
        trader: this.bots.randomTrader(),
      });
    }
  }

  /**
   * Records a bot trade. If the displayed price is off its fate path, the trade *is* the move:
   * its side and size come from the move and the price jumps to the path. Otherwise it's plain
   * flow at the current price. Bots never touch the curve, and they only sell what they hold:
   * with no holder to sell into a drop, the trade becomes a plain buy (that buyer can sell next).
   */
  private fillBotOrder(token: LiveToken, order: BotOrder): void {
    const { summary, botHoldings } = token;
    const at = tokenTime(token);
    const drift = driftOf(token);
    let moves = Math.abs(drift) >= MOVE_DRIFT && !(summary.status === "rugged" && drift > 0);
    let side = moves ? (drift > 0 ? "buy" : "sell") : order.side;
    let trader = order.trader;

    // The creator can always rug their own token, bag or not (backdated tokens never got a launch buy).
    const isRug = order.rug === true && summary.status === "rugged" && moves && side === "sell";
    if (side === "sell") {
      // Creators hold until they rug: their only sell is the rug itself.
      const seller = isRug ? order.trader : this.bots.pickHolder(botHoldings, summary.creatorHandle);
      if (seller) {
        trader = seller;
      } else if (summary.status === "rugged") {
        return; // Nobody left to panic-sell.
      } else {
        moves = false;
        side = "buy";
      }
    }

    let price = summary.price;
    let tokenAmount: number;
    let solAmount: number;
    if (moves) {
      const flow = flowForMove(token.curve, token.displayMultiple, token.sim.multiple);
      price = flow.avgPrice;
      const bag = botHoldings.get(trader) ?? 0;
      tokenAmount = side === "sell" && !(isRug && bag === 0) ? Math.min(flow.tokenAmount, bag) : flow.tokenAmount;
      solAmount = side === "sell" ? tokenAmount * flow.avgPrice : flow.solAmount;
      token.displayMultiple = token.sim.multiple;
      this.setPrice(token, at);
    } else if (side === "sell") {
      const size = order.solAmount > 0 ? order.solAmount : this.bots.flowSize(summary);
      tokenAmount = Math.min(botHoldings.get(trader)!, size / price);
      solAmount = tokenAmount * price;
    } else {
      solAmount = order.solAmount > 0 ? order.solAmount : this.bots.flowSize(summary);
      tokenAmount = solAmount / price;
    }
    if (!(solAmount > 0)) return;

    const held = (botHoldings.get(trader) ?? 0) + (side === "buy" ? tokenAmount : -tokenAmount);
    if (held > DUST_TOKENS) botHoldings.set(trader, held);
    else botHoldings.delete(trader);

    this.recordTrade(
      token,
      {
        id: crypto.randomUUID(),
        tokenId: summary.id,
        ticker: summary.ticker,
        name: summary.name,
        imageUrl: summary.imageUrl,
        side,
        solAmount,
        tokenAmount,
        price,
        trader,
        isBot: true,
        isDev: trader === summary.creatorHandle,
        realizedPnlSol: null,
        at,
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

  /** Reprices from displayMultiple and the curve, updates candles, and fires graduation / pump milestones. */
  private setPrice(token: LiveToken, at: number, options: { quiet?: boolean; candles?: boolean } = {}): void {
    const { summary } = token;
    const price = token.displayMultiple * spotPrice(token.curve);
    summary.price = price;
    summary.marketCap = marketCapSol(price);
    summary.athPrice = Math.max(summary.athPrice, price);
    summary.bondingProgress = bondingProgress(price);

    if (options.candles ?? true) {
      const emit = !options.quiet && this.events.wantsCandles(summary.id);
      for (const builder of token.candles) {
        const candle = builder.add(at, price);
        if (emit) this.events.candle(candle);
      }
    }
    token.dirty = true;
    if (!options.quiet) this.moved.add(token);
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
    // The house token never graduates, even if players buy it past the graduation price.
    if (summary.status === "live" && summary.price >= GRADUATION_PRICE && token.fate !== "house") {
      summary.status = "graduated";
      summary.graduatedAt = at;
      this.callout(token, "graduated", `🎓 $${summary.ticker} graduated!`, at, quiet);
      this.statusChanged(token, quiet);
    }

    const multiple = summary.price / LAUNCH_PRICE;
    let reached = -1;
    while (token.nextPumpCallout !== -1 && multiple >= PUMP_CALLOUT_MULTIPLES[token.nextPumpCallout]!) {
      reached = PUMP_CALLOUT_MULTIPLES[token.nextPumpCallout]!;
      token.nextPumpCallout =
        token.nextPumpCallout + 1 < PUMP_CALLOUT_MULTIPLES.length ? token.nextPumpCallout + 1 : -1;
    }
    if (reached !== -1) this.callout(token, "pump", `🚀 $${summary.ticker} just hit ${reached}x`, at, quiet);
  }

  /** Rug and end of life. Driven by the sim clock only, never by trades. */
  private checkLifecycle(token: LiveToken, at: number, quiet: boolean): void {
    const { sim, summary } = token;
    if (sim.tick === sim.plan.rugTick && summary.status === "live") {
      summary.status = "rugged";
      // The rug is the creator dumping at the top: a sell sized to take the price down to the path.
      // (Replaying quietly, the price already followed the path.)
      // On a player's token the player isn't the rugger: the biggest bot holder dumps instead.
      const rugger = summary.byPlayer
        ? (this.bots.biggestHolder(token.botHoldings) ?? this.bots.randomTrader())
        : summary.creatorHandle;
      if (!quiet)
        this.fillBotOrder(token, { tokenId: summary.id, side: "sell", solAmount: 0, trader: rugger, rug: true });
      const drop = Math.min(99, Math.floor((1 - summary.price / summary.athPrice) * 100));
      this.callout(token, "rug", `💀 $${summary.ticker} RUGGED -${drop}%`, at, quiet);
      this.statusChanged(token, quiet);
      // Even when replaying quietly after a restart: holders still got rugged.
      this.store.recordRug(summary.id, at).catch((err) => console.error("recording rug victims failed", err));
    }

    if (sim.done) {
      if (summary.status === "live") summary.status = sim.plan.endStatus;
      summary.endedAt = at;
      token.dirty = true;
      this.statusChanged(token, quiet);
    }
  }
}

import type { Callout, Candle, PriceTick, TokenStatusChange, TokenSummary, TradeEvent } from "@ruggedfun/shared";
import { createRng, GRADUATION_PRICE, spotPrice } from "@ruggedfun/sim";
import { describe, expect, it } from "vitest";
import { BotFlow, type BotOrder, type BotView } from "../src/bots";
import {
  Market,
  TickerTakenError,
  TradeError,
  type MarketEvents,
  type MarketStore,
  type StoredToken,
} from "../src/market";

class MemoryStore implements MarketStore {
  tokens = new Map<string, StoredToken>();
  candles: Candle[] = [];
  takenTickers = new Set<string>();

  async insertToken(token: StoredToken) {
    if (this.takenTickers.has(token.summary.ticker)) throw new TickerTakenError();
    this.takenTickers.add(token.summary.ticker);
    this.tokens.set(token.summary.id, structuredClone(token));
  }
  async loadBotHoldings(tokenIds: string[]) {
    const result = new Map<string, Map<string, number>>();
    for (const t of this.trades) {
      if (!tokenIds.includes(t.tokenId) || !t.isBot) continue;
      const bag = result.get(t.tokenId) ?? new Map<string, number>();
      bag.set(t.trader, (bag.get(t.trader) ?? 0) + (t.side === "buy" ? t.tokenAmount : -t.tokenAmount));
      result.set(t.tokenId, bag);
    }
    return result;
  }
  async loadLive(): Promise<StoredToken[]> {
    return [...this.tokens.values()].filter((t) => t.summary.endedAt === null).map((t) => structuredClone(t));
  }
  trades: TradeEvent[] = [];
  rugs: string[] = [];
  async recordRug(tokenId: string) {
    this.rugs.push(tokenId);
  }
  async save(tokens: StoredToken[], candles: Candle[], trades: TradeEvent[]) {
    for (const t of tokens) Object.assign(this.tokens.get(t.summary.id)!, structuredClone(t));
    this.candles.push(...candles);
    this.trades.push(...trades);
  }
}

function recorder(watchCharts = false) {
  const log = {
    launched: [] as TokenSummary[],
    ticks: [] as PriceTick[][],
    status: [] as TokenStatusChange[],
    candles: [] as Candle[],
    callouts: [] as Callout[],
    trades: [] as TradeEvent[],
  };
  const events: MarketEvents = {
    launched: (t) => log.launched.push(t),
    ticks: (t) => log.ticks.push(t),
    status: (s) => log.status.push(s),
    candle: (c) => log.candles.push(c),
    callout: (c) => log.callouts.push(c),
    trade: (t) => log.trades.push(t),
    wantsCandles: () => watchCharts,
  };
  return { log, events };
}

/** Ticks once per second until every token has ended. */
function runToEnd(market: Market, from: number): number {
  let now = from;
  while (market.summaries().some((t) => t.endedAt === null)) {
    now += 1000;
    market.tick(now);
  }
  return now;
}

const T0 = 1_700_000_000_000;

/** Deterministic stand-in for Math.random, so bot flow is repeatable in tests. */
function seededRandom(seed: string): () => number {
  const rng = createRng(seed);
  return () => rng.next();
}

describe("Market", () => {
  it("launches a token and announces it", async () => {
    const store = new MemoryStore();
    const { log, events } = recorder();
    const market = new Market(store, events);
    await market.launch(T0);
    expect(log.launched).toHaveLength(1);
    expect(store.tokens.size).toBe(1);
  });

  it("only moves a token's price in a second where it traded", async () => {
    const { log, events } = recorder();
    const market = new Market(new MemoryStore(), events, { bots: new BotFlow(6, seededRandom("moves")) });
    const tokens = await Promise.all(
      (["rug", "slow_death", "survive", "moon"] as const).map((fate) => market.launch(T0, { fate })),
    );
    let last = new Map(market.summaries().map((t) => [t.id, t.price]));

    for (let s = 1; s <= 1200; s++) {
      const tradesBefore = log.trades.length;
      market.tick(T0 + s * 1000);
      const tradedNow = new Set(log.trades.slice(tradesBefore).map((t) => t.tokenId));
      for (const t of market.summaries()) {
        if (t.price !== last.get(t.id)) expect(tradedNow.has(t.id)).toBe(true);
      }
      last = new Map(market.summaries().map((t) => [t.id, t.price]));
    }
    // And prices did move: the fate paths still play out through trades.
    expect(log.ticks.length).toBeGreaterThan(50);
    void tokens;
  });

  it("bots never sell more than they hold (only the creator can rug without a bag)", async () => {
    const { log, events } = recorder();
    const market = new Market(new MemoryStore(), events, { bots: new BotFlow(6, seededRandom("bags")) });
    for (const fate of ["rug", "slow_death", "survive", "moon"] as const) await market.launch(T0, { fate });
    runToEnd(market, T0);

    const bags = new Map<string, number>();
    for (const t of log.trades.filter((t) => t.isBot)) {
      const key = `${t.tokenId}:${t.trader}`;
      const next = (bags.get(key) ?? 0) + (t.side === "buy" ? t.tokenAmount : -t.tokenAmount);
      if (!(t.isDev && t.side === "sell")) expect(next).toBeGreaterThan(-1e-3);
      bags.set(key, next);
    }
    expect(log.trades.filter((t) => t.side === "sell").length).toBeGreaterThan(20);
    // Creators hold until they rug: the rug token's creator sells once, the others never.
    const devSells = log.trades.filter((t) => t.isDev && t.side === "sell");
    expect(devSells).toHaveLength(1);
  });

  it("never exposes the seed or fate in summaries", async () => {
    const market = new Market(new MemoryStore(), recorder().events);
    await market.launch(T0, { fate: "moon" });
    for (const s of market.summaries()) {
      expect(s).not.toHaveProperty("seed");
      expect(s).not.toHaveProperty("fate");
    }
  });

  it("rugs: status flips at the rug tick, a callout fires, then the token ends", async () => {
    const store = new MemoryStore();
    const { log, events } = recorder();
    const market = new Market(store, events);
    const token = await market.launch(T0, { fate: "rug" });

    runToEnd(market, T0);
    expect(log.status.map((s) => s.status)).toEqual(["rugged", "rugged"]);
    expect(log.status.at(-1)!.endedAt).not.toBeNull();
    expect(log.callouts.find((c) => c.kind === "rug")?.text).toMatch(/RUGGED -9\d%/);

    await market.flush();
    expect(market.size).toBe(0);
    expect(store.tokens.get(token.id)!.summary).toMatchObject({ status: "rugged" });
  });

  it("moons: graduates once and fires pump callouts", async () => {
    const { log, events } = recorder();
    const market = new Market(new MemoryStore(), events);
    await market.launch(T0, { fate: "moon" });

    runToEnd(market, T0);
    const graduations = log.status.filter((s) => s.status === "graduated");
    expect(graduations.length).toBeGreaterThanOrEqual(1);
    expect(log.callouts.filter((c) => c.kind === "graduated")).toHaveLength(1);
    expect(log.callouts.some((c) => c.text.includes("just hit 10x"))).toBe(true);
    expect(market.summaries()[0]!.athPrice).toBeGreaterThanOrEqual(GRADUATION_PRICE);
  });

  it("slow deaths end as dead", async () => {
    const { log, events } = recorder();
    const market = new Market(new MemoryStore(), events);
    await market.launch(T0, { fate: "slow_death" });
    runToEnd(market, T0);
    expect(log.status.at(-1)!.status).toBe("dead");
  });

  it("tracks 5m change and a sparkline sampled every 10s", async () => {
    const market = new Market(new MemoryStore(), recorder().events);
    const launched = await market.launch(T0, { fate: "moon" });
    expect(launched.sparkline).toHaveLength(1);
    expect(launched.change5m).toBe(0);

    market.tick(T0 + 10 * 60_000);
    const token = market.summaries()[0]!;
    expect(token.sparkline).toHaveLength(30);
    expect(token.change5m).toBeCloseTo(token.price / token.sparkline[0]! - 1, 12);
  });

  it("includes recent callouts in the snapshot", async () => {
    const market = new Market(new MemoryStore(), recorder().events);
    await market.launch(T0, { fate: "rug" });
    runToEnd(market, T0);
    expect(market.snapshot().callouts.some((c) => c.kind === "rug")).toBe(true);
  });

  it("only emits candles when someone is watching", async () => {
    const quiet = recorder(false);
    const watched = recorder(true);
    const a = new Market(new MemoryStore(), quiet.events);
    const b = new Market(new MemoryStore(), watched.events);
    await a.launch(T0);
    await b.launch(T0);
    a.tick(T0 + 10_000);
    b.tick(T0 + 10_000);
    expect(quiet.log.candles).toHaveLength(0);
    expect(watched.log.candles.length).toBeGreaterThan(0);
  });

  it("retries with a new ticker when one is taken", async () => {
    const store = new MemoryStore();
    const market = new Market(store, recorder().events);
    const realInsert = store.insertToken.bind(store);
    let calls = 0;
    store.insertToken = async (t) => {
      if (calls++ === 0) throw new TickerTakenError();
      return realInsert(t);
    };
    await market.launch(T0);
    expect(calls).toBe(2);
    expect(store.tokens.size).toBe(1);
  });

  it("restores live tokens onto their fate path after a restart", async () => {
    type Internals = { live: Map<string, { sim: { multiple: number } }> };
    const store = new MemoryStore();
    const first = new Market(store, recorder().events);
    await first.launch(T0, { fate: "survive" });
    first.tick(T0 + 120_000);
    await first.flush();
    first.tick(T0 + 300_000);
    // Live, the displayed price trails the path until the next trade; the path itself is deterministic.
    const pathMultiple = [...(first as unknown as Internals).live.values()][0]!.sim.multiple;

    const second = new Market(store, recorder().events);
    await second.restore(T0 + 300_000);
    const restored = second.summaries()[0]!;
    // A restore replays quietly, so the displayed price lands exactly on the path.
    expect(restored.price).toBeCloseTo(pathMultiple * spotPrice(restored.curve), 15);
  });

  it("backdated launches are fast-forwarded silently with full candle history", async () => {
    const store = new MemoryStore();
    const { log, events } = recorder(true);
    const market = new Market(store, events);
    await market.launch(T0, { fate: "survive", backdateMs: 10 * 60_000 });
    expect(log.launched).toHaveLength(0);
    expect(log.candles).toHaveLength(0);
    await market.flush();
    expect(store.candles.filter((c) => c.interval === 60).length).toBeGreaterThanOrEqual(10);
  });

  describe("trading", () => {
    function fakeTrade(
      token: TokenSummary,
      side: "buy" | "sell",
      quote: ReturnType<Market["quote"]>["quote"],
      at: number,
    ): TradeEvent {
      return {
        id: crypto.randomUUID(),
        tokenId: token.id,
        ticker: token.ticker,
        name: token.name,
        imageUrl: token.imageUrl,
        side,
        solAmount: quote.solAmount,
        tokenAmount: quote.tokenAmount,
        price: quote.avgPrice,
        trader: "tester",
        isBot: false,
        isDev: false,
        realizedPnlSol: null,
        at,
        priceAfter: quote.priceAfter,
        curve: quote.curve,
      };
    }

    it("quotes at the current price and a buy pushes the price up", async () => {
      const { log, events } = recorder(true);
      const market = new Market(new MemoryStore(), events);
      const token = await market.launch(T0, { fate: "survive" });
      market.tick(T0 + 30_000);
      const before = market.summaries()[0]!.price;

      const { quote } = market.quote(token.id, "buy", 1);
      expect(quote.avgPrice).toBeGreaterThan(before);
      const candlesBefore = log.candles.length;
      market.commitTrade(fakeTrade(token, "buy", quote, T0 + 30_000), quote);

      const after = market.summaries()[0]!;
      expect(after.price).toBeCloseTo(quote.priceAfter, 15);
      expect(after.curve).toEqual(quote.curve);
      expect(log.trades.filter((t) => t.trader === "tester")).toHaveLength(1);
      expect(log.ticks.at(-1)).toEqual([expect.objectContaining({ id: token.id, price: after.price })]);
      // The trade's candle gained exactly its 1 SOL of volume.
      const added = log.candles.slice(candlesBefore);
      const candle5s = added.filter((c) => c.interval === 5);
      const prior = log.candles
        .slice(0, candlesBefore)
        .filter((c) => c.interval === 5 && c.time === candle5s.at(-1)!.time);
      expect(candle5s.at(-1)!.volume - (prior.at(-1)?.volume ?? 0)).toBeCloseTo(1, 9);
    });

    it("blocks buys after a rug but still allows sells", async () => {
      const market = new Market(new MemoryStore(), recorder().events);
      const token = await market.launch(T0, { fate: "rug" });
      const { quote } = market.quote(token.id, "buy", 1);
      market.commitTrade(fakeTrade(token, "buy", quote, T0), quote);

      const sim = market as unknown as { live: Map<string, { sim: { plan: { rugTick: number } } }> };
      const rugTick = sim.live.get(token.id)!.sim.plan.rugTick;
      market.tick(T0 + rugTick * 1000);

      expect(() => market.quote(token.id, "buy", 1)).toThrow(TradeError);
      const sell = market.quote(token.id, "sell", quote.tokenAmount).quote;
      expect(sell.solAmount).toBeLessThan(0.1);
    });

    it("rejects trades on tokens that have ended", async () => {
      const market = new Market(new MemoryStore(), recorder().events);
      const token = await market.launch(T0, { fate: "rug" });
      runToEnd(market, T0);
      expect(() => market.quote(token.id, "sell", 1)).toThrow(/stopped trading/);
    });

    it("caps sells at what the curve has sold", async () => {
      const market = new Market(new MemoryStore(), recorder().events);
      const token = await market.launch(T0, { fate: "survive" });
      const { quote } = market.quote(token.id, "buy", 1);
      market.commitTrade(fakeTrade(token, "buy", quote, T0), quote);
      const sell = market.quote(token.id, "sell", quote.tokenAmount * 1.000001).quote;
      expect(sell.tokenAmount).toBeCloseTo(quote.tokenAmount, 3);
    });

    it("a player buy can graduate a token and fires the callout once", async () => {
      const { log, events } = recorder();
      const market = new Market(new MemoryStore(), events);
      const token = await market.launch(T0, { fate: "survive" });
      const { quote } = market.quote(token.id, "buy", 200);
      market.commitTrade(fakeTrade(token, "buy", quote, T0), quote);
      expect(market.summaries()[0]!.status).toBe("graduated");
      expect(log.callouts.filter((c) => c.kind === "graduated")).toHaveLength(1);
      expect(() => market.quote(token.id, "buy", 1)).toThrow(/complete/);
    });
  });

  describe("player launches", () => {
    const player = {
      userId: "00000000-0000-4000-8000-000000000001",
      username: "frogking",
      name: "Moon Frog",
      ticker: "MFROG",
      description: "ribbit",
      imageUrl: "https://api.dicebear.com/9.x/bottts/svg?seed=x",
    };

    it("uses the player's details, gets no bot dev buy, and is announced", async () => {
      const store = new MemoryStore();
      const { log, events } = recorder();
      const market = new Market(store, events, { bots: new BotFlow(0) });
      const token = await market.launch(T0, { player });
      expect(token).toMatchObject({ name: "Moon Frog", ticker: "MFROG", creatorHandle: "frogking", byPlayer: true });
      expect(store.tokens.get(token.id)!.creatorUserId).toBe(player.userId);
      market.tick(T0 + 1000);
      expect(log.trades.filter((t) => t.isDev)).toHaveLength(0);
      expect(log.callouts.find((c) => c.kind === "launch")?.text).toBe("🆕 frogking launched $MFROG");
    });

    it("throws instead of renaming when the ticker is taken", async () => {
      const store = new MemoryStore();
      store.takenTickers.add("MFROG");
      const market = new Market(store, recorder().events);
      await expect(market.launch(T0, { player })).rejects.toBeInstanceOf(TickerTakenError);
    });

    it("a player's token is rugged by a bot, never by the player", async () => {
      const { log, events } = recorder();
      const market = new Market(new MemoryStore(), events, { bots: new BotFlow(6, seededRandom("player-rug")) });
      const token = await market.launch(T0, { fate: "rug", player });
      runToEnd(market, T0);
      expect(market.summaries().length === 0 || market.summaries()[0]!.status === "rugged").toBe(true);
      const rug = log.trades
        .filter((t) => t.tokenId === token.id && t.side === "sell")
        .reduce((a, b) => (b.price / b.priceAfter > a.price / a.priceAfter ? b : a));
      expect(rug.price / rug.priceAfter).toBeGreaterThan(3);
      expect(rug.trader).not.toBe("frogking");
      expect(rug.isBot).toBe(true);
      expect(log.trades.some((t) => t.trader === "frogking")).toBe(false);
    });
  });

  describe("leaderboard hooks", () => {
    it("records rug victims when a token rugs live", async () => {
      const store = new MemoryStore();
      const market = new Market(store, recorder().events);
      const token = await market.launch(T0, { fate: "rug" });
      runToEnd(market, T0);
      expect(store.rugs).toEqual([token.id]);
    });

    it("records rug victims for rugs replayed quietly after a restart", async () => {
      const store = new MemoryStore();
      const token = await new Market(store, recorder().events).launch(T0, { fate: "rug" });
      await new Market(store, recorder().events).restore(T0 + 3 * 3600_000);
      expect(store.rugs).toEqual([token.id]);
    });

    it("calls out big player profits", async () => {
      const { log, events } = recorder();
      const market = new Market(new MemoryStore(), events);
      const token = await market.launch(T0, { fate: "survive" });
      const buy = market.quote(token.id, "buy", 1).quote;
      market.commitTrade(
        {
          id: crypto.randomUUID(),
          tokenId: token.id,
          ticker: token.ticker,
          name: token.name,
          imageUrl: token.imageUrl,
          side: "sell",
          solAmount: 3,
          tokenAmount: buy.tokenAmount,
          price: 3 / buy.tokenAmount,
          trader: "lucky",
          isBot: false,
          isDev: false,
          realizedPnlSol: 2,
          at: T0,
          priceAfter: buy.priceAfter,
          curve: buy.curve,
        },
        buy,
      );
      expect(log.callouts.find((c) => c.kind === "win")?.text).toBe(
        `💰 lucky took +2.00 SOL on $${token.ticker} (3.0x)`,
      );
    });
  });

  describe("bots", () => {
    /** Bots that place exactly the orders the script returns, every second. */
    class ScriptedBots extends BotFlow {
      constructor(private readonly script: (views: BotView[], now: number) => BotOrder[]) {
        super(1);
      }
      override ordersFor(views: BotView[], now: number): BotOrder[] {
        return this.script(views, now);
      }
    }
    const buyEach = (sol: number) => (views: BotView[]) =>
      views.map((v) => ({ tokenId: v.id, side: "buy" as const, solAmount: sol, trader: "whale_bot" }));

    it("the creator buys right after launch, once", async () => {
      const { log, events } = recorder();
      const market = new Market(new MemoryStore(), events, { bots: new ScriptedBots(() => []) });
      const token = await market.launch(T0);
      market.tick(T0 + 1000);
      market.tick(T0 + 2000);
      const devBuys = log.trades.filter((t) => t.isDev && t.side === "buy");
      expect(devBuys).toHaveLength(1);
      expect(devBuys[0]).toMatchObject({ trader: token.creatorHandle, isBot: true });
    });

    it("restored and backdated tokens don't get a dev buy", async () => {
      const { log, events } = recorder();
      const market = new Market(new MemoryStore(), events, { bots: new ScriptedBots(() => []) });
      await market.launch(T0, { backdateMs: 60_000 });
      market.tick(T0 + 1000);
      expect(log.trades.some((t) => t.isDev)).toBe(false);
    });

    it("bot trades add volume but never move the curve", async () => {
      const store = new MemoryStore();
      await new Market(store, recorder().events).launch(T0, { fate: "survive" });
      const { log, events } = recorder();
      const withBots = new Market(store, events, { bots: new ScriptedBots(buyEach(10)) });
      await withBots.restore(T0);
      const curveBefore = withBots.summaries()[0]!.curve;

      for (let s = 1; s <= 60; s++) withBots.tick(T0 + s * 1000);
      const token = withBots.summaries()[0]!;
      expect(log.trades.length).toBeGreaterThanOrEqual(60);
      expect(token.curve).toEqual(curveBefore);
      expect(token.volume5m).toBeCloseTo(
        log.trades.reduce((sum, t) => sum + t.solAmount, 0),
        9,
      );
    });

    it("volume5m forgets trades older than five minutes", async () => {
      let calls = 0;
      const { log, events } = recorder();
      const bots = new ScriptedBots((views) => (++calls <= 10 ? buyEach(1)(views) : []));
      const market = new Market(new MemoryStore(), events, { bots });
      await market.launch(T0, { fate: "survive", backdateMs: 1 });
      for (let s = 1; s <= 10; s++) market.tick(T0 + s * 1000);
      expect(market.summaries()[0]!.volume5m).toBeCloseTo(
        log.trades.reduce((sum, t) => sum + t.solAmount, 0),
        9,
      );
      market.tick(T0 + 400_000);
      const recent = log.trades.filter((t) => t.at > T0 + 100_000).reduce((sum, t) => sum + t.solAmount, 0);
      expect(market.summaries()[0]!.volume5m).toBeCloseTo(recent, 9);
    });

    it("persists bot trades on flush", async () => {
      const store = new MemoryStore();
      const market = new Market(store, recorder().events, { bots: new ScriptedBots(buyEach(1)) });
      await market.launch(T0, { backdateMs: 1 });
      for (let s = 1; s <= 10; s++) market.tick(T0 + s * 1000);
      await market.flush();
      expect(store.trades).toHaveLength(10);
      expect(store.trades.every((t) => t.isBot && !t.isDev)).toBe(true);
    });

    it("the creator dumps at the rug, priced before the crash", async () => {
      const { log, events } = recorder();
      const market = new Market(new MemoryStore(), events, { bots: new ScriptedBots(() => []) });
      const token = await market.launch(T0, { fate: "rug" });
      runToEnd(market, T0);
      // Creators sell into ordinary dips too; the rug is the dev sell that crashes the price.
      const devSells = log.trades.filter((t) => t.isDev && t.side === "sell");
      const dump = devSells.reduce((a, b) => (b.price / b.priceAfter > a.price / a.priceAfter ? b : a));
      expect(dump).toMatchObject({ trader: token.creatorHandle, isBot: true });
      // The dump fills on the way down, well above where the price ends up.
      expect(dump!.price / dump!.priceAfter).toBeGreaterThan(3);
    });

    it("big bot buys make the hot ticker; small ones don't", async () => {
      const big = recorder();
      const small = recorder();
      await new Market(new MemoryStore(), big.events, { bots: new ScriptedBots(buyEach(6)) }).launch(T0, {
        backdateMs: 1,
      });
      const m1 = new Market(new MemoryStore(), big.events, { bots: new ScriptedBots(buyEach(6)) });
      const m2 = new Market(new MemoryStore(), small.events, { bots: new ScriptedBots(buyEach(1)) });
      await m1.launch(T0, { backdateMs: 1 });
      await m2.launch(T0, { backdateMs: 1 });
      // At launch the price is exactly on its path, so these are plain-flow buys of the scripted size.
      m1.tick(T0);
      m2.tick(T0);
      expect(big.log.callouts.some((c) => c.kind === "whale" && c.text.startsWith("🐋 whale_bot aped 6.0 SOL"))).toBe(
        true,
      );
      expect(small.log.callouts.some((c) => c.kind === "whale")).toBe(false);
    });
  });
});

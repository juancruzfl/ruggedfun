import type { TokenStatus, TradeSide } from "@ruggedfun/shared";
import { createRng, LAUNCH_PRICE, marketCapSol } from "@ruggedfun/sim";
import { generateHandle } from "./names";

/**
 * Bots are the traders behind each token's fate path. Their trades are the visible flow that
 * "caused" the price, so they're recorded at the current price and do NOT move the curve
 * (that would count the market twice and bend the fate odds). Only players move the curve.
 */
export const BOT_TUNING = {
  /** Trades per second per unit of activity, before the global budget is applied. */
  baseRate: 0.15,
  /** Young tokens get a burst of attention that fades with this time constant. */
  youthSeconds: 300,
  youthWeight: 1.5,
  /** Activity added per unit of 5-second return (both directions draw traders). */
  momentumWeight: 15,
  maxMomentum: 2,
  /** Activity per order of magnitude of market cap above launch. */
  sizeWeight: 0.5,
  baseline: 0.02,
  /** Panic sellers after a rug. */
  ruggedActivity: 0.3,
  /** Buy probability = 0.5 + returnBias × 5s return, clamped. */
  returnBias: 4,
  minBuyChance: 0.15,
  maxBuyChance: 0.85,
  /** Trade size in SOL is log-normal: median, log-sigma, and a hard cap. */
  sizeMedianSol: 0.3,
  sizeSigma: 1.2,
  maxSol: 50,
  minSol: 0.01,
  /** The creator's buy right after launch. */
  devBuySol: [0.5, 3] as const,
  /** The creator's dump at the rug, as a share of the ATH market cap. */
  devDumpShare: 0.15,
  handlePool: 400,
};

const LAUNCH_MCAP = marketCapSol(LAUNCH_PRICE);

/** What the bot flow needs to know about a token. */
export interface BotView {
  id: string;
  status: TokenStatus;
  marketCap: number;
  createdAt: number;
  /** Price change over the last ~5 seconds, as a fraction. */
  recentReturn: number;
}

export interface BotOrder {
  tokenId: string;
  side: TradeSide;
  solAmount: number;
  trader: string;
}

export class BotFlow {
  private readonly handles: string[];

  constructor(
    /** Global budget, so a busy market doesn't flood the feed. 0 turns bots off. */
    private readonly tradesPerSecond: number,
    private readonly random: () => number = Math.random,
  ) {
    const rng = createRng("bot-handles");
    this.handles = Array.from({ length: BOT_TUNING.handlePool }, () => generateHandle(rng));
  }

  /** How much trading a token attracts right now. */
  activity(token: BotView, now: number): number {
    const t = BOT_TUNING;
    if (token.status === "dead") return 0;
    if (token.status === "rugged") return t.ruggedActivity;
    const ageSeconds = (now - token.createdAt) / 1000;
    const youth = t.youthWeight * Math.exp(-ageSeconds / t.youthSeconds);
    const momentum = Math.min(t.maxMomentum, t.momentumWeight * Math.abs(token.recentReturn));
    const size = t.sizeWeight * Math.max(0, Math.log10(token.marketCap / LAUNCH_MCAP));
    return t.baseline + youth + momentum + size;
  }

  /** Orders for one second of market time across all tokens. */
  ordersFor(tokens: BotView[], now: number): BotOrder[] {
    if (this.tradesPerSecond <= 0 || tokens.length === 0) return [];
    const rates = tokens.map((t) => BOT_TUNING.baseRate * this.activity(t, now));
    const total = rates.reduce((sum, r) => sum + r, 0);
    const scale = total > this.tradesPerSecond ? this.tradesPerSecond / total : 1;

    const orders: BotOrder[] = [];
    tokens.forEach((token, i) => {
      const expected = rates[i]! * scale;
      const count = Math.floor(expected) + (this.random() < expected % 1 ? 1 : 0);
      for (let n = 0; n < count; n++) orders.push(this.order(token));
    });
    return orders;
  }

  devBuy(tokenId: string, creator: string): BotOrder {
    const [min, max] = BOT_TUNING.devBuySol;
    return { tokenId, side: "buy", solAmount: round(min + (max - min) * this.random()), trader: creator };
  }

  devDump(tokenId: string, creator: string, athMarketCap: number): BotOrder {
    return {
      tokenId,
      side: "sell",
      solAmount: round(Math.max(1, Math.min(200, athMarketCap * BOT_TUNING.devDumpShare))),
      trader: creator,
    };
  }

  private order(token: BotView): BotOrder {
    const t = BOT_TUNING;
    const buyChance =
      token.status === "rugged"
        ? 0
        : Math.min(t.maxBuyChance, Math.max(t.minBuyChance, 0.5 + t.returnBias * token.recentReturn));
    const side: TradeSide = this.random() < buyChance ? "buy" : "sell";

    // Bigger tokens draw bigger trades; post-rug panic sells are small.
    const sizeBoost = 1 + 0.5 * Math.max(0, Math.log10(token.marketCap / LAUNCH_MCAP));
    const panic = token.status === "rugged" ? 0.3 : 1;
    const size = t.sizeMedianSol * Math.exp(t.sizeSigma * this.normal()) * sizeBoost * panic;

    return {
      tokenId: token.id,
      side,
      solAmount: round(Math.min(t.maxSol, Math.max(t.minSol, size))),
      trader: this.handles[Math.floor(this.random() * this.handles.length)]!,
    };
  }

  private normal(): number {
    let u = 0;
    while (u === 0) u = this.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.random());
  }
}

const round = (sol: number) => Math.round(sol * 1000) / 1000;

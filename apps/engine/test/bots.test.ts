import { createRng, initialCurve, LAUNCH_PRICE, marketCapSol } from "@ruggedfun/sim";
import { describe, expect, it } from "vitest";
import { BOT_TUNING, BotFlow, type BotView } from "../src/bots";

const NOW = 1_700_000_000_000;
const seeded = (seed: string) => {
  const rng = createRng(seed);
  return () => rng.next();
};

function view(overrides: Partial<BotView> = {}): BotView {
  return {
    id: crypto.randomUUID(),
    status: "live",
    marketCap: marketCapSol(LAUNCH_PRICE) * 3,
    createdAt: NOW - 30_000,
    recentReturn: 0,
    ...overrides,
  };
}

describe("BotFlow", () => {
  it("never exceeds the global trade budget on average", () => {
    const bots = new BotFlow(6, seeded("budget"));
    const tokens = Array.from({ length: 500 }, () => view({ createdAt: NOW - 5000, recentReturn: 0.2 }));
    let total = 0;
    for (let s = 0; s < 200; s++) total += bots.ordersFor(tokens, NOW).length;
    expect(total / 200).toBeGreaterThan(5);
    expect(total / 200).toBeLessThan(7);
  });

  it("is off when the budget is 0", () => {
    expect(new BotFlow(0).ordersFor([view()], NOW)).toEqual([]);
  });

  it("buys into pumps and sells into dumps", () => {
    const bots = new BotFlow(1000, seeded("bias"));
    const share = (recentReturn: number) => {
      const tokens = Array.from({ length: 300 }, () => view({ recentReturn }));
      const orders = Array.from({ length: 20 }, () => bots.ordersFor(tokens, NOW)).flat();
      return orders.filter((o) => o.side === "buy").length / orders.length;
    };
    expect(share(0.05)).toBeGreaterThan(0.6);
    expect(share(-0.05)).toBeLessThan(0.4);
  });

  it("only sells after a rug, and ignores dead tokens", () => {
    const bots = new BotFlow(1000, seeded("rugged"));
    const rugged = Array.from({ length: 200 }, () => view({ status: "rugged" }));
    const orders = Array.from({ length: 20 }, () => bots.ordersFor(rugged, NOW)).flat();
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.every((o) => o.side === "sell")).toBe(true);
    expect(bots.ordersFor([view({ status: "dead" })], NOW)).toEqual([]);
  });

  it("keeps trade sizes within bounds", () => {
    const bots = new BotFlow(1000, seeded("sizes"));
    const tokens = Array.from({ length: 300 }, () => view({ marketCap: 5000 }));
    const sizes = Array.from({ length: 20 }, () => bots.ordersFor(tokens, NOW)).flat().map((o) => o.solAmount);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(BOT_TUNING.minSol);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(BOT_TUNING.maxSol);
  });

  it("sizes the dev dump from the ATH market cap", () => {
    const dump = new BotFlow(1).devDump("t", "dev", 100);
    expect(dump).toMatchObject({ side: "sell", solAmount: 15, trader: "dev" });
  });
});

// Keep the import used: bots never touch the curve, so tests compare against a fresh one.
void initialCurve;

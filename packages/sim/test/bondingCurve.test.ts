import { describe, expect, it } from "vitest";
import { CURVE, GRADUATION_MULTIPLE, initialCurve, quoteBuy, quoteSell, spotPrice } from "../src";

describe("bonding curve", () => {
  it("graduates at roughly 14.7x the launch price", () => {
    expect(GRADUATION_MULTIPLE).toBeCloseTo(14.7, 1);
  });

  it("raises the price on buys and lowers it on sells", () => {
    const start = initialCurve();
    const buy = quoteBuy(start, 1);
    expect(spotPrice(buy.state)).toBeGreaterThan(spotPrice(start));
    const sell = quoteSell(buy.state, buy.tokenAmount);
    expect(spotPrice(sell.state)).toBeCloseTo(spotPrice(start), 15);
  });

  it("loses only fees on a round trip", () => {
    const buy = quoteBuy(initialCurve(), 2);
    const sell = quoteSell(buy.state, buy.tokenAmount);
    expect(sell.solAmount).toBeLessThan(2);
    expect(sell.solAmount + buy.feeSol + sell.feeSol).toBeCloseTo(2, 9);
  });

  it("partially fills a buy that would overrun the curve", () => {
    const fill = quoteBuy(initialCurve(), 1000);
    expect(fill.state.tokensLeft).toBe(0);
    expect(fill.tokenAmount).toBe(CURVE.curveTokens);
    expect(fill.solAmount).toBeLessThan(90);
    expect(() => quoteBuy(fill.state, 1)).toThrow();
  });

  it("rejects selling more than was bought", () => {
    const buy = quoteBuy(initialCurve(), 1);
    expect(() => quoteSell(buy.state, buy.tokenAmount * 2)).toThrow();
  });
});

describe("bondingProgress", () => {
  it("runs from 0 at launch to 1 at graduation", async () => {
    const { bondingProgress, LAUNCH_PRICE, GRADUATION_PRICE } = await import("../src");
    expect(bondingProgress(LAUNCH_PRICE)).toBeCloseTo(0, 9);
    expect(bondingProgress(GRADUATION_PRICE)).toBeCloseTo(1, 9);
    expect(bondingProgress(LAUNCH_PRICE / 10)).toBe(0);
    expect(bondingProgress(GRADUATION_PRICE * 10)).toBe(1);
  });
});

describe("quoteTrade", () => {
  it("scales SOL by the fate multiple", async () => {
    const { quoteTrade, initialCurve, quoteBuy, LAUNCH_PRICE } = await import("../src");
    const atLaunch = quoteBuy(initialCurve(), 1);
    const at3x = quoteTrade(initialCurve(), 3, "buy", 3);
    expect(at3x.tokenAmount).toBeCloseTo(atLaunch.tokenAmount, 6);
    expect(at3x.solAmount).toBeCloseTo(3, 9);
    expect(at3x.avgPrice).toBeGreaterThan(3 * LAUNCH_PRICE);
    expect(at3x.priceAfter).toBeGreaterThan(at3x.avgPrice);
  });

  it("round-trips at a constant multiple for fees only", async () => {
    const { quoteTrade, initialCurve, CURVE } = await import("../src");
    const buy = quoteTrade(initialCurve(), 0.05, "buy", 2);
    const sell = quoteTrade(buy.curve, 0.05, "sell", buy.tokenAmount);
    const feeRate = CURVE.feeBps / 10_000;
    expect(sell.solAmount).toBeLessThan(2);
    expect(sell.solAmount).toBeGreaterThan(2 * (1 - 2.5 * feeRate));
  });

  it("profits when the multiple rises and loses when it falls", async () => {
    const { quoteTrade, initialCurve } = await import("../src");
    const buy = quoteTrade(initialCurve(), 1, "buy", 1);
    expect(quoteTrade(buy.curve, 2, "sell", buy.tokenAmount).solAmount).toBeGreaterThan(1.9);
    expect(quoteTrade(buy.curve, 0.02, "sell", buy.tokenAmount).solAmount).toBeLessThan(0.03);
  });
});

describe("liquidationValue", () => {
  it("matches an actual sell quote at the current price", async () => {
    const { initialCurve, liquidationValue, quoteTrade, spotPrice } = await import("../src");
    for (const m of [10, 1, 0.1, 0.03]) {
      const buy = quoteTrade(initialCurve(), m, "buy", 1);
      const price = m * spotPrice(buy.curve);
      const sell = quoteTrade(buy.curve, m, "sell", buy.tokenAmount);
      expect(liquidationValue(buy.curve, price, buy.tokenAmount)).toBeCloseTo(sell.solAmount, 9);
    }
  });

  it("is about -2% of cost right after a buy, however thin the curve (mark value isn't)", async () => {
    const { initialCurve, liquidationValue, quoteTrade, spotPrice } = await import("../src");
    for (const m of [10, 1, 0.03]) {
      const buy = quoteTrade(initialCurve(), m, "buy", 1);
      const price = m * spotPrice(buy.curve);
      expect(liquidationValue(buy.curve, price, buy.tokenAmount)).toBeCloseTo(0.9802, 3);
    }
    const thin = quoteTrade(initialCurve(), 0.03, "buy", 1);
    expect(thin.tokenAmount * 0.03 * spotPrice(thin.curve)).toBeGreaterThan(2);
  });

  it("is 0 when nothing can be sold", async () => {
    const { initialCurve, liquidationValue, LAUNCH_PRICE } = await import("../src");
    expect(liquidationValue(initialCurve(), LAUNCH_PRICE, 1_000_000)).toBe(0);
  });
});

describe("flowForMove", () => {
  it("sizes a buy that moves the spot price by exactly the requested ratio", async () => {
    const { initialCurve, flowForMove, quoteTrade, spotPrice } = await import("../src");
    const curve = initialCurve();
    const flow = flowForMove(curve, 2, 2.2);
    expect(flow.side).toBe("buy");
    // Replaying it as a real trade lands on the target multiple's price.
    const real = quoteTrade(curve, 2, "buy", flow.solAmount);
    expect(2 * spotPrice(real.curve)).toBeCloseTo(2.2 * spotPrice(curve), 15);
    expect(real.tokenAmount).toBeCloseTo(flow.tokenAmount, 3);
  });

  it("sizes a sell for a drop, and a rug-sized drop is a big sell", async () => {
    const { initialCurve, flowForMove, quoteBuy } = await import("../src");
    const curve = quoteBuy(initialCurve(), 20).state;
    const small = flowForMove(curve, 1, 0.95);
    const rug = flowForMove(curve, 4, 0.1);
    expect(small.side).toBe("sell");
    expect(small.solAmount).toBeGreaterThan(0);
    expect(rug.solAmount).toBeGreaterThan(50);
  });
});

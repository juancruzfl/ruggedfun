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

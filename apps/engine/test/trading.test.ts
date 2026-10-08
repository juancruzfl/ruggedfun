import { describe, expect, it } from "vitest";
import { confirmationDelayMs } from "../src/trading";

/** Feeds `confirmationDelayMs` a fixed sequence instead of Math.random. */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe("confirmationDelayMs", () => {
  it("is off when the range is 0", () => {
    expect(confirmationDelayMs(0, 0)).toBe(0);
  });

  it("stays in range, except for the occasional congested trade (2–3x)", () => {
    expect(confirmationDelayMs(400, 1500, sequence(0, 0.9))).toBe(400);
    expect(confirmationDelayMs(400, 1500, sequence(1, 0.9))).toBe(1500);
    expect(confirmationDelayMs(400, 1500, sequence(0.5, 0.01, 0.5))).toBe(950 * 2.5);

    let longest = 0;
    let slow = 0;
    for (let i = 0; i < 10_000; i++) {
      const ms = confirmationDelayMs(400, 1500);
      expect(ms).toBeGreaterThanOrEqual(400);
      longest = Math.max(longest, ms);
      if (ms > 1500) slow++;
    }
    // Under the web app's 10s timeout to the engine.
    expect(longest).toBeLessThanOrEqual(4500);
    expect(slow / 10_000).toBeGreaterThan(0.02);
    expect(slow / 10_000).toBeLessThan(0.06);
  });
});

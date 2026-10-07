import { describe, expect, it } from "vitest";
import { CandleBuilder } from "../src/candles";

describe("CandleBuilder", () => {
  it("rolls prices into buckets and opens each candle at the previous close", () => {
    const b = new CandleBuilder("t", 5);
    b.add(0, 10);
    b.add(1000, 12);
    b.add(4999, 9);
    const next = b.add(5000, 1);
    expect(next).toMatchObject({ time: 5, open: 9, high: 9, low: 1, close: 1 });

    const drained = b.drain();
    expect(drained).toHaveLength(2);
    expect(drained[0]).toMatchObject({ time: 0, open: 10, high: 12, low: 9, close: 9 });
    expect(drained[1]).toMatchObject({ time: 5, close: 1 });
  });

  it("keeps reporting the open candle until it closes", () => {
    const b = new CandleBuilder("t", 60);
    b.add(0, 1);
    expect(b.drain()).toHaveLength(1);
    b.add(1000, 2);
    expect(b.drain()).toEqual([expect.objectContaining({ time: 0, high: 2, close: 2 })]);
  });
});

import type { Candle, CandleInterval } from "@ruggedfun/shared";

/** Rolls per-tick prices into OHLC candles for one token and one interval. */
export class CandleBuilder {
  private current: Candle | null = null;
  private closed: Candle[] = [];
  private lastClose: number | null = null;

  constructor(
    readonly tokenId: string,
    readonly interval: CandleInterval,
  ) {}

  /**
   * Picks up a stored candle as the open one, so points after a restart extend it instead of
   * starting the bucket over (which would lose its open, high and low).
   */
  seed(candle: Candle): void {
    this.current = { ...candle };
    this.lastClose = candle.close;
  }

  /** Adds a price at `timeMs` and returns the candle it landed in. */
  add(timeMs: number, price: number, volume = 0): Candle {
    // A point that arrives late (a trade that committed after the next tick) folds into the open candle.
    const time = Math.max(Math.floor(timeMs / 1000 / this.interval) * this.interval, this.current?.time ?? -Infinity);
    if (this.current && this.current.time !== time) {
      this.closed.push(this.current);
      this.current = null;
    }
    if (!this.current) {
      // Open at the previous close so the chart has no gaps (and a rug shows as one big red candle).
      const open = this.lastClose ?? price;
      this.current = {
        tokenId: this.tokenId,
        interval: this.interval,
        time,
        open,
        high: Math.max(open, price),
        low: Math.min(open, price),
        close: price,
        volume,
      };
    } else {
      this.current.high = Math.max(this.current.high, price);
      this.current.low = Math.min(this.current.low, price);
      this.current.close = price;
      this.current.volume += volume;
    }
    this.lastClose = price;
    return { ...this.current };
  }

  /** Candles closed since the last drain, plus a copy of the one still open. */
  drain(): Candle[] {
    const out = this.closed;
    this.closed = [];
    if (this.current) out.push({ ...this.current });
    return out;
  }
}

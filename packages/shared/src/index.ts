/** Contracts shared by the engine and the web app. Nothing here may reveal a token's fate. */

import type { CurveState, TradeEvent } from "./trading";

export type TokenStatus = "live" | "graduated" | "rugged" | "dead";

export interface TokenSummary {
  id: string;
  name: string;
  ticker: string;
  imageUrl: string;
  description: string;
  creatorHandle: string;
  status: TokenStatus;
  /** SOL per token. */
  price: number;
  /** SOL. */
  marketCap: number;
  athPrice: number;
  /** 0–1, the pump.fun-style progress bar toward graduation. */
  bondingProgress: number;
  /** Unix ms. */
  createdAt: number;
  graduatedAt: number | null;
  endedAt: number | null;
}

/** Seconds between sparkline samples, and how many samples are kept (30 × 10s = 5 minutes). */
export const SPARKLINE_SAMPLE_SECONDS = 10;
export const SPARKLINE_POINTS = 30;

/** A token as the live market sees it: the stored summary plus short-term price history. */
export interface MarketToken extends TokenSummary {
  /** Bonding-curve reserves. Changes only on trades; lets the browser quote trades exactly. */
  curve: CurveState;
  /** Price change over the last ~5 minutes, as a fraction (0.12 = +12%). */
  change5m: number;
  /** Prices sampled every SPARKLINE_SAMPLE_SECONDS, oldest first. Excludes the current price. */
  sparkline: number[];
  /** SOL traded (bots + players) in the last 5 minutes. */
  volume5m: number;
}

export interface PriceTick {
  id: string;
  price: number;
  marketCap: number;
  bondingProgress: number;
  change5m: number;
  volume5m: number;
}

/** Candle intervals in seconds. 1s candles aren't stored; clients build them from ticks. */
export const CANDLE_INTERVALS = [5, 60] as const;
export type CandleInterval = (typeof CANDLE_INTERVALS)[number];

export interface Candle {
  tokenId: string;
  interval: CandleInterval;
  /** Bucket start, unix seconds (lightweight-charts format). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TokenStatusChange {
  id: string;
  status: TokenStatus;
  /** Set when the token stops trading for good. */
  endedAt: number | null;
}

export type CalloutKind = "pump" | "rug" | "graduated" | "whale" | "win";

/** Item for the hot-callouts ticker. */
export interface Callout {
  kind: CalloutKind;
  tokenId: string;
  ticker: string;
  text: string;
  at: number;
}

export interface MarketSnapshot {
  /** Every token that is still trading. */
  tokens: MarketToken[];
  /** Most recent callouts, newest last. */
  callouts: Callout[];
}

export interface ServerToClientEvents {
  /** Sent once on connect. */
  snapshot: (snapshot: MarketSnapshot) => void;
  "token:launched": (token: MarketToken) => void;
  /** Batched once per second, only tokens whose price moved. */
  "token:tick": (ticks: PriceTick[]) => void;
  "token:status": (change: TokenStatusChange) => void;
  /** Only sent to clients subscribed to that token. */
  "token:candle": (candle: Candle) => void;
  callout: (callout: Callout) => void;
  /** Every filled trade, on every token. */
  trade: (trade: TradeEvent) => void;
}

export interface ClientToServerEvents {
  "token:subscribe": (tokenId: string) => void;
  "token:unsubscribe": (tokenId: string) => void;
}

export * from "./account";
export * from "./market";
export * from "./trading";

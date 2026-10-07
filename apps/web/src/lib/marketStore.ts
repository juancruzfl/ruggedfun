"use client";

import {
  SPARKLINE_POINTS,
  type Callout,
  type MarketSnapshot,
  type MarketToken,
  type PriceTick,
  type TokenStatusChange,
  type TokenSummary,
  type TradeEvent,
} from "@ruggedfun/shared";
import { create } from "zustand";

const MAX_GRAVEYARD = 60;
const MAX_CALLOUTS = 20;
const MAX_TRADES = 500;

interface MarketState {
  connected: boolean;
  /** True once the first snapshot has arrived. */
  loaded: boolean;
  /** Tokens still trading, by id. */
  tokens: Record<string, MarketToken>;
  /** Rugged tokens that have stopped trading, newest first. */
  graveyard: TokenSummary[];
  /** Newest last. */
  callouts: Callout[];
  /** Trades seen since this tab connected, newest first. */
  trades: TradeEvent[];

  setConnected(connected: boolean): void;
  applySnapshot(snapshot: MarketSnapshot): void;
  addToken(token: MarketToken): void;
  applyTicks(ticks: PriceTick[]): void;
  applyStatus(change: TokenStatusChange): void;
  addCallout(callout: Callout): void;
  addToGraveyard(tokens: TokenSummary[]): void;
  applyTrade(trade: TradeEvent): void;
  /** Appends each token's current price to its sparkline. Called every SPARKLINE_SAMPLE_SECONDS. */
  sampleSparklines(): void;
}

function mergeGraveyard(existing: TokenSummary[], incoming: TokenSummary[]): TokenSummary[] {
  const seen = new Set<string>();
  return [...incoming, ...existing]
    .filter((t) => !seen.has(t.id) && Boolean(seen.add(t.id)))
    .slice(0, MAX_GRAVEYARD);
}

export const useMarket = create<MarketState>((set) => ({
  connected: false,
  loaded: false,
  tokens: {},
  graveyard: [],
  callouts: [],
  trades: [],

  setConnected: (connected) => set({ connected }),

  applySnapshot: ({ tokens, callouts }) =>
    set({ loaded: true, tokens: Object.fromEntries(tokens.map((t) => [t.id, t])), callouts }),

  addToken: (token) => set((s) => ({ tokens: { ...s.tokens, [token.id]: token } })),

  applyTicks: (ticks) =>
    set((s) => {
      const tokens = { ...s.tokens };
      for (const tick of ticks) {
        const token = tokens[tick.id];
        if (!token) continue;
        tokens[tick.id] = { ...token, ...tick, athPrice: Math.max(token.athPrice, tick.price) };
      }
      return { tokens };
    }),

  applyStatus: ({ id, status, endedAt }) =>
    set((s) => {
      const token = s.tokens[id];
      if (!token) return {};
      const updated = { ...token, status, endedAt };
      if (endedAt === null) return { tokens: { ...s.tokens, [id]: updated } };

      // Stopped trading: drop it from the live market; rugs go to the graveyard.
      const { [id]: _, ...rest } = s.tokens;
      return {
        tokens: rest,
        graveyard: status === "rugged" ? mergeGraveyard(s.graveyard, [updated]) : s.graveyard,
      };
    }),

  addCallout: (callout) => set((s) => ({ callouts: [...s.callouts, callout].slice(-MAX_CALLOUTS) })),

  applyTrade: (trade) =>
    set((s) => {
      const token = s.tokens[trade.tokenId];
      return {
        trades: [trade, ...s.trades].slice(0, MAX_TRADES),
        // The engine follows up with a tick for the new price; the curve only changes here.
        tokens: token ? { ...s.tokens, [trade.tokenId]: { ...token, curve: trade.curve } } : s.tokens,
      };
    }),

  addToGraveyard: (incoming) => set((s) => ({ graveyard: mergeGraveyard(s.graveyard, incoming) })),

  sampleSparklines: () =>
    set((s) => ({
      tokens: Object.fromEntries(
        Object.entries(s.tokens).map(([id, t]) => [
          id,
          { ...t, sparkline: [...t.sparkline, t.price].slice(-SPARKLINE_POINTS) },
        ]),
      ),
    })),
}));

"use client";

import type { TradeEvent, TradeSide } from "@ruggedfun/shared";
import { create } from "zustand";

/**
 * A player trade from the moment it's sent until it confirms or fails. The engine holds each trade
 * for a simulated confirmation (~0.4–2s), so these live in a store rather than in the trade form:
 * the quick-trade modal closes as soon as the trade is sent, and the notification card carries on.
 */
export interface PendingTrade {
  id: number;
  ticker: string;
  imageUrl: string;
  side: TradeSide;
  /** SOL for buys, tokens for sells. */
  amount: number;
  startedAt: number;
  status: "confirming" | "confirmed" | "failed";
  trade?: TradeEvent;
  error?: string;
}

export const useTradeStatus = create<{
  trades: PendingTrade[];
  start(trade: Omit<PendingTrade, "id" | "startedAt" | "status">): number;
  confirm(id: number, trade: TradeEvent): void;
  fail(id: number, error: string): void;
  dismiss(id: number): void;
}>((set) => ({
  trades: [],
  start: (trade) => {
    const id = Date.now() + Math.random();
    set((s) => ({ trades: [...s.trades, { ...trade, id, startedAt: Date.now(), status: "confirming" }] }));
    return id;
  },
  confirm: (id, trade) =>
    set((s) => ({ trades: s.trades.map((t) => (t.id === id ? { ...t, status: "confirmed", trade } : t)) })),
  fail: (id, error) =>
    set((s) => ({ trades: s.trades.map((t) => (t.id === id ? { ...t, status: "failed", error } : t)) })),
  dismiss: (id) => set((s) => ({ trades: s.trades.filter((t) => t.id !== id) })),
}));

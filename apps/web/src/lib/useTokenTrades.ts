"use client";

import type { TradeEvent } from "@ruggedfun/shared";
import { useEffect, useState } from "react";
import { useMarket } from "./marketStore";

const MAX_TRADES = 50;

export interface TokenTradeTotals {
  /** This token's trades since the page rendered, newest first (at most 50). */
  trades: TradeEvent[];
  /** SOL traded on this token since the page rendered. */
  volume: number;
  /** The signed-in player's own flows on this token since the page rendered. */
  mine: { boughtSol: number; boughtTokens: number; soldSol: number };
}

const EMPTY: TokenTradeTotals = { trades: [], volume: 0, mine: { boughtSol: 0, boughtTokens: 0, soldSol: 0 } };

function fold(acc: TokenTradeTotals, oldestFirst: TradeEvent[], username: string | undefined): TokenTradeTotals {
  let { volume } = acc;
  const mine = { ...acc.mine };
  for (const t of oldestFirst) {
    volume += t.solAmount;
    if (!t.isBot && t.trader === username) {
      if (t.side === "buy") {
        mine.boughtSol += t.solAmount;
        mine.boughtTokens += t.tokenAmount;
      } else {
        mine.soldSol += t.solAmount;
      }
    }
  }
  return { trades: [...oldestFirst.reverse(), ...acc.trades].slice(0, MAX_TRADES), volume, mine };
}

/**
 * Running totals for one token's trades since the page rendered. The market store only keeps the
 * latest few hundred trades across *all* tokens (gone within a minute at full speed), so totals
 * built from it would shrink as trades age out. This accumulates each trade once, as it arrives.
 */
export function useTokenTrades(tokenId: string, username: string | undefined, renderedAt: number): TokenTradeTotals {
  const [totals, setTotals] = useState<TokenTradeTotals>(EMPTY);

  useEffect(() => {
    const relevant = (t: TradeEvent) => t.tokenId === tokenId && t.at > renderedAt;
    // Anything that arrived between the render and this effect is still in the buffer.
    setTotals(fold(EMPTY, useMarket.getState().trades.filter(relevant).reverse(), username));

    return useMarket.subscribe((state, prev) => {
      if (state.trades === prev.trades) return;
      const lastSeen = prev.trades[0]?.id;
      const fresh: TradeEvent[] = [];
      for (const t of state.trades) {
        if (t.id === lastSeen) break;
        if (relevant(t)) fresh.push(t);
      }
      if (fresh.length > 0) setTotals((acc) => fold(acc, fresh.reverse(), username));
    });
  }, [tokenId, username, renderedAt]);

  return totals;
}

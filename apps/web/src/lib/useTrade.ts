"use client";

import {
  DEFAULT_SLIPPAGE_BPS,
  isHouseToken,
  MIN_BUY_SOL,
  type Me,
  type MarketToken,
  type TradeRequest,
  type TradeResult,
  type TradeEvent,
  type TradeSide,
} from "@ruggedfun/shared";
import { quoteTrade, spotPrice, tokensSold, type TradeQuote } from "@ruggedfun/sim";
import { useState } from "react";
import { useSession } from "@/components/SessionProvider";
import { formatTokens } from "./format";
import { isMoonSell, useMoments } from "./moments";
import { sounds } from "./sound";
import { useTradeStatus } from "./tradeStatus";

export interface QuoteState {
  quote: TradeQuote | null;
  /** Why the trade can't go through, if it can't. */
  problem: string | null;
}

/**
 * Quotes a trade exactly the way the engine will fill it, using the live price and curve.
 * Recomputed on every price tick.
 */
export function quoteFor(token: MarketToken | undefined, me: Me | null, side: TradeSide, amount: number): QuoteState {
  if (!me) return { quote: null, problem: "Create a wallet first" };
  if (!token || token.endedAt !== null) return { quote: null, problem: "This token has stopped trading" };
  if (side === "buy" && (token.status === "rugged" || token.status === "dead")) {
    return { quote: null, problem: "Rugged. Buying is disabled." };
  }
  // The house token never graduates, so its curve never runs out (the engine quotes it the same way).
  const uncapped = isHouseToken(token);
  if (side === "buy" && !uncapped && token.curve.tokensLeft <= 0) {
    return { quote: null, problem: "The bonding curve is complete" };
  }
  if (!(amount > 0)) return { quote: null, problem: null };

  const held = me.positions.find((p) => p.tokenId === token.id)?.tokenAmount ?? 0;
  if (side === "buy" && amount < MIN_BUY_SOL) return { quote: null, problem: `Minimum buy is ${MIN_BUY_SOL} SOL` };
  if (side === "buy" && amount > me.wallet.solBalance + 1e-9) return { quote: null, problem: "Not enough SOL" };
  if (side === "sell" && amount > held * (1 + 1e-9)) {
    return { quote: null, problem: held > 0 ? `You only hold ${formatTokens(held)}` : "You don't hold any" };
  }

  try {
    const multiple = token.price / spotPrice(token.curve);
    const size = side === "sell" ? Math.min(amount, tokensSold(token.curve)) : amount;
    return { quote: quoteTrade(token.curve, multiple, side, size, { uncapped }), problem: null };
  } catch (err) {
    return { quote: null, problem: err instanceof Error ? err.message : "Can't quote this trade" };
  }
}

/**
 * Fill time of the newest trade result applied to the session: the balance overall, positions per
 * token. Several trades can be in flight at once and their responses can arrive out of order, but the
 * engine fills them one at a time, so a result older than one already applied would be stale.
 */
const applied = { balanceAt: 0, positionAt: new Map<string, number>() };

/**
 * Sends a trade and folds the result into the session (balance + positions). The engine holds each
 * trade for a simulated confirmation (~0.4–2s); meanwhile a notification card tracks it (see
 * useTradeStatus). Like a real launchpad, more trades can be sent before earlier ones confirm: each
 * one is checked against the wallet when it fills, so one that can't be paid for by then fails.
 * Resolves to the filled trade, or null if it failed (see `error`).
 */
export function useSubmitTrade() {
  const { me, setMe } = useSession();
  const [inFlight, setInFlight] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function submit(
    token: MarketToken,
    side: TradeSide,
    amount: number,
    quote: TradeQuote,
  ): Promise<TradeEvent | null> {
    if (!me) return null;
    setInFlight((n) => n + 1);
    setError(null);
    const status = useTradeStatus.getState();
    const id = status.start({ ticker: token.ticker, imageUrl: token.imageUrl, side, amount });
    const fail = (message: string) => {
      setError(message);
      status.fail(id, message);
      return null;
    };
    try {
      const request: TradeRequest = {
        tokenId: token.id,
        side,
        amount,
        expectedPrice: quote.avgPrice,
        slippageBps: DEFAULT_SLIPPAGE_BPS,
      };
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const body = (await res.json()) as TradeResult | { error: string };
      if (!res.ok || "error" in body) return fail("error" in body ? body.error : "Trade failed");

      const { trade } = body;
      const freshBalance = trade.at >= applied.balanceAt;
      const freshPosition = trade.at >= (applied.positionAt.get(token.id) ?? 0);
      if (freshBalance) applied.balanceAt = trade.at;
      if (freshPosition) applied.positionAt.set(token.id, trade.at);
      // Merge into the latest session, not the one this trade started with: others may have landed since.
      setMe((current) => {
        if (!current) return current;
        const others = current.positions.filter((p) => p.tokenId !== token.id);
        return {
          ...current,
          wallet: freshBalance ? { ...current.wallet, solBalance: body.solBalance } : current.wallet,
          positions: freshPosition ? (body.position ? [body.position, ...others] : others) : current.positions,
        };
      });
      status.confirm(id, trade);
      const moon = side === "sell" ? isMoonSell(trade.solAmount, trade.realizedPnlSol) : null;
      if (moon) {
        useMoments.getState().show({ kind: "moon", tokenId: token.id, ticker: token.ticker, name: token.name, imageUrl: token.imageUrl, ...moon });
      } else if (side === "buy") {
        sounds.buy();
      } else {
        sounds.sell();
      }
      return trade;
    } catch {
      return fail("Couldn't reach the server. Try again.");
    } finally {
      setInFlight((n) => n - 1);
    }
  }

  return { submit, pending: inFlight > 0, error, clearError: () => setError(null) };
}

"use client";

import {
  DEFAULT_SLIPPAGE_BPS,
  MIN_BUY_SOL,
  type Me,
  type MarketToken,
  type TradeRequest,
  type TradeResult,
  type TradeSide,
} from "@ruggedfun/shared";
import { quoteTrade, spotPrice, tokensSold, type TradeQuote } from "@ruggedfun/sim";
import { useState } from "react";
import { useSession } from "@/components/SessionProvider";
import { useToast } from "@/components/Toaster";
import { formatSol, formatTokens } from "./format";
import { isMoonSell, useMoments } from "./moments";
import { sounds } from "./sound";

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
  if (side === "buy" && token.curve.tokensLeft <= 0) return { quote: null, problem: "The bonding curve is complete" };
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
    return { quote: quoteTrade(token.curve, multiple, side, size), problem: null };
  } catch (err) {
    return { quote: null, problem: err instanceof Error ? err.message : "Can't quote this trade" };
  }
}

/** Sends a trade and folds the result into the session (balance + positions). */
export function useSubmitTrade() {
  const { me, setMe } = useSession();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(token: MarketToken, side: TradeSide, amount: number, quote: TradeQuote): Promise<boolean> {
    if (!me || pending) return false;
    setPending(true);
    setError(null);
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
      if (!res.ok || "error" in body) {
        setError("error" in body ? body.error : "Trade failed");
        return false;
      }

      const others = me.positions.filter((p) => p.tokenId !== token.id);
      setMe({
        ...me,
        wallet: { ...me.wallet, solBalance: body.solBalance },
        positions: body.position ? [body.position, ...others] : others,
      });
      const { trade } = body;
      const moon = side === "sell" ? isMoonSell(trade.solAmount, trade.realizedPnlSol) : null;
      if (moon) {
        useMoments.getState().show({ kind: "moon", tokenId: token.id, ticker: token.ticker, name: token.name, imageUrl: token.imageUrl, ...moon });
      } else if (side === "buy") {
        sounds.buy();
      } else {
        sounds.sell();
      }
      toast(
        side === "buy"
          ? `Bought ${formatTokens(trade.tokenAmount)} $${trade.ticker} for ${formatSol(trade.solAmount)} SOL`
          : `Sold ${formatTokens(trade.tokenAmount)} $${trade.ticker} for ${formatSol(trade.solAmount)} SOL`,
      );
      return true;
    } catch {
      setError("Couldn't reach the server. Try again.");
      return false;
    } finally {
      setPending(false);
    }
  }

  return { submit, pending, error, clearError: () => setError(null) };
}

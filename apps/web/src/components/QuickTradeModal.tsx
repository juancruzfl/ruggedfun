"use client";

import Link from "next/link";
import { useEffect } from "react";
import { formatUsd } from "@/lib/format";
import { useMarket } from "@/lib/marketStore";
import { useQuickTrade } from "@/lib/quickTrade";
import { Change, StatusBadge, TokenAvatar } from "./TokenBits";
import { TradeForm } from "./TradeForm";

/**
 * Buy or sell without leaving the page. Opened from [Buy] buttons (cards, live feed),
 * the token page's mobile action bar, and the rug moment's "sell what's left".
 */
export function QuickTradeModal() {
  const { tokenId, side, close } = useQuickTrade();
  const token = useMarket((s) => (tokenId ? s.tokens[tokenId] : undefined));

  useEffect(() => {
    if (!tokenId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tokenId, close]);

  if (!tokenId) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:px-4"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-trade-title"
        className="w-full max-w-sm rounded-t-2xl border border-line bg-panel p-5 shadow-2xl shadow-black/60 sm:rounded-2xl"
      >
        {token ? (
          <>
            <div className="mb-4 flex items-center gap-3">
              <TokenAvatar src={token.imageUrl} alt="" size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 id="quick-trade-title" className="truncate font-bold">
                    {token.name}
                  </h2>
                  <StatusBadge status={token.status} />
                </div>
                <div className="text-xs text-muted">
                  ${token.ticker} · MC <span className="font-mono text-text">{formatUsd(token.marketCap)}</span>{" "}
                  <Change value={token.change5m} />
                </div>
              </div>
              <button onClick={close} aria-label="Close" className="text-xl text-muted hover:text-text">
                ×
              </button>
            </div>
            <TradeForm key={side} tokenId={token.id} fixedSide={side} autoFocus onDone={close} />
            <Link
              href={`/token/${token.ticker}`}
              onClick={close}
              className="mt-3 block text-center text-xs text-muted hover:text-text"
            >
              Open chart →
            </Link>
          </>
        ) : (
          <div className="py-6 text-center">
            <h2 id="quick-trade-title" className="font-bold">
              This token has stopped trading
            </h2>
            <button onClick={close} className="mt-4 text-sm text-pump hover:underline">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

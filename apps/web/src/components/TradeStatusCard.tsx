"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatSol, formatTokens } from "@/lib/format";
import { useTradeStatus, type PendingTrade } from "@/lib/tradeStatus";
import { useStackExpanded } from "./NotificationStack";
import { TokenAvatar } from "./TokenBits";

/** How long a finished trade's card stays up (a fanned-out stack pauses it). */
const VISIBLE_MS = 2500;

/** Border color for a trade's card in the stack. */
export function tradeCardFrame(trade: PendingTrade): string {
  if (trade.status === "failed") return "border-rug/50";
  if (trade.status === "confirmed") return trade.side === "buy" ? "border-pump/40" : "border-rug/40";
  return "border-line";
}

/** One player trade in the notification stack: confirming, then confirmed or failed. */
export function TradeStatusCard({ trade }: { trade: PendingTrade }) {
  const dismiss = useTradeStatus((s) => s.dismiss);
  const paused = useStackExpanded();
  const [elapsed, setElapsed] = useState(0);
  const { status, side } = trade;
  const buy = side === "buy";

  useEffect(() => {
    if (status !== "confirming") return;
    const timer = setInterval(() => setElapsed(Date.now() - trade.startedAt), 100);
    return () => clearInterval(timer);
  }, [status, trade.startedAt]);

  useEffect(() => {
    if (status === "confirming" || paused) return;
    const timer = setTimeout(() => dismiss(trade.id), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [status, paused, dismiss, trade.id]);

  const amount = buy ? `${formatSol(trade.amount)} SOL` : `${formatTokens(trade.amount)} $${trade.ticker}`;

  return (
    <div role="status" className="flex gap-3 p-3">
      {/* Sized to the avatar, so the badge sits on its corner (the img alone leaves a taller line box). */}
      <div className="relative size-10 shrink-0">
        <TokenAvatar src={trade.imageUrl} alt="" size={40} />
        {status !== "confirming" && (
          <span
            aria-hidden
            className={`absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border-2 border-panel text-[10px] font-bold ${
              status === "failed" ? "bg-rug text-rug-ink" : buy ? "bg-pump text-pump-ink" : "bg-rug text-rug-ink"
            }`}
          >
            {status === "failed" ? "!" : "✓"}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-semibold">
            {status === "confirming" && `${buy ? "Buying" : "Selling"} $${trade.ticker}…`}
            {status === "confirmed" && (
              <>
                {buy ? "Bought" : "Sold"} <span className={buy ? "text-pump" : "text-rug"}>${trade.ticker}</span>
              </>
            )}
            {status === "failed" && `${buy ? "Buy" : "Sell"} failed`}
          </p>
          {status !== "confirming" && (
            <button onClick={() => dismiss(trade.id)} aria-label="Dismiss" className="-mt-1 text-muted hover:text-text">
              ×
            </button>
          )}
        </div>

        {status === "confirming" && (
          <>
            <p className="flex justify-between font-mono text-xs text-muted">
              <span>{amount}</span>
              <span>{(elapsed / 1000).toFixed(1)}s</span>
            </p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-panel-2" aria-hidden>
              <div className={`h-full w-2/5 rounded-full animate-indeterminate ${buy ? "bg-pump" : "bg-rug"}`} />
            </div>
          </>
        )}

        {status === "confirmed" && trade.trade && (
          <>
            <p className="font-mono text-xs text-muted">
              {formatTokens(trade.trade.tokenAmount)} ${trade.ticker} {buy ? "for" : "→"}{" "}
              <span className="text-text">{formatSol(trade.trade.solAmount)} SOL</span>
            </p>
            <Link
              href={`/token/${trade.ticker}`}
              onClick={() => dismiss(trade.id)}
              className="mt-2 inline-block rounded-md bg-panel-2 px-2.5 py-1 text-xs font-semibold hover:bg-line"
            >
              View
            </Link>
          </>
        )}

        {status === "failed" && <p className="text-xs text-rug">{trade.error}</p>}
      </div>
    </div>
  );
}

"use client";

import type { MarketToken, TokenSummary } from "@ruggedfun/shared";
import Link from "next/link";
import { memo } from "react";
import { formatUsd, timeAgo } from "@/lib/format";
import { BuyButton } from "./BuyButton";
import { Sparkline } from "./Sparkline";
import { Change, ProgressBar, StatusBadge, TokenAvatar } from "./TokenBits";
import { useFlash } from "./useFlash";

const NEW_LAUNCH_MS = 5000;

/** Graveyard tokens come from the database and have no live history. */
type CardToken = TokenSummary & Partial<Pick<MarketToken, "change5m" | "sparkline">>;

const flashClass = { up: "animate-flash-up", down: "animate-flash-down" } as const;

export const TokenCard = memo(function TokenCard({ token }: { token: CardToken }) {
  const flash = useFlash(token.marketCap);
  const isNew = Date.now() - token.createdAt < NEW_LAUNCH_MS;
  const gone = token.status === "rugged" || token.status === "dead";

  // The link stretches over the whole card; content ignores clicks so they reach it, except the Buy button.
  return (
    <div
      className={`relative rounded-xl border border-line bg-panel p-3 transition hover:border-pump/40 hover:bg-panel-2 ${
        isNew ? "animate-shake border-pump/60" : ""
      }`}
    >
      <Link href={`/token/${token.ticker}`} className="absolute inset-0 rounded-xl" aria-label={`${token.name} ($${token.ticker})`} />
      <div className="pointer-events-none flex gap-3">
        <TokenAvatar src={token.imageUrl} alt="" size={64} dim={gone} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{token.name}</span>
            <StatusBadge status={token.status} />
          </div>
          <div className="truncate text-xs text-muted">
            ${token.ticker} · {timeAgo(token.createdAt)} · by {token.creatorHandle}
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-xs text-muted">MC</span>
            <span className={`rounded px-1 font-mono font-semibold ${flash ? flashClass[flash] : ""}`}>
              {formatUsd(token.marketCap)}
            </span>
            {token.change5m !== undefined && <Change value={token.change5m} className="text-xs" />}
          </div>
        </div>
      </div>

      {token.sparkline && (
        <Sparkline points={[...token.sparkline, token.price]} className="pointer-events-none mt-2 h-8 w-full" />
      )}

      <div className="pointer-events-none mt-2 flex items-center gap-2">
        <ProgressBar value={token.bondingProgress} />
        <span className="w-9 text-right font-mono text-[11px] text-muted">{Math.round(token.bondingProgress * 100)}%</span>
        {!gone && <BuyButton tokenId={token.id} ticker={token.ticker} className="px-2.5 py-1 text-xs" />}
      </div>
    </div>
  );
});

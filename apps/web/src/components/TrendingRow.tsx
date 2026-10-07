"use client";

import { trendingScore, type MarketToken } from "@ruggedfun/shared";
import Link from "next/link";
import { memo } from "react";
import { useShallow } from "zustand/react/shallow";
import { formatUsd } from "@/lib/format";
import { useMarket } from "@/lib/marketStore";
import { BuyButton } from "./BuyButton";
import { Sparkline } from "./Sparkline";
import { Change, StatusBadge, TokenAvatar } from "./TokenBits";

const TRENDING_COUNT = 10;

const TrendingCard = memo(function TrendingCard({ token, rank }: { token: MarketToken; rank: number }) {
  return (
    <div className="relative flex w-56 shrink-0 flex-col rounded-xl border border-line bg-panel p-3 transition hover:border-pump/40 hover:bg-panel-2">
      <Link href={`/token/${token.ticker}`} className="absolute inset-0 rounded-xl" aria-label={`${token.name} ($${token.ticker})`} />
      <span className="pointer-events-none absolute right-3 top-2 font-mono text-xs text-muted">#{rank}</span>
      <div className="pointer-events-none flex items-center gap-3">
        <TokenAvatar src={token.imageUrl} alt="" size={48} />
        <div className="min-w-0">
          <div className="truncate pr-6 font-semibold">{token.name}</div>
          <div className="text-xs text-muted">${token.ticker}</div>
        </div>
      </div>
      <div className="pointer-events-none mt-2 flex items-baseline justify-between">
        <span className="font-mono text-lg font-bold">{formatUsd(token.marketCap)}</span>
        <Change value={token.change5m} className="text-sm" />
      </div>
      <Sparkline points={[...token.sparkline, token.price]} className="pointer-events-none mt-1 h-10 w-full" />
      <div className="pointer-events-none mt-2 flex items-center justify-between">
        <StatusBadge status={token.status} />
        <BuyButton tokenId={token.id} ticker={token.ticker} className="ml-auto px-3 py-1 text-xs" />
      </div>
    </div>
  );
});

export function TrendingRow() {
  const loaded = useMarket((s) => s.loaded);
  const trending = useMarket(
    useShallow((s) => {
      const now = Date.now();
      return Object.values(s.tokens)
        .map((t) => ({ t, score: trendingScore(t, now) }))
        .filter(({ score }) => score > -Infinity)
        .sort((a, b) => b.score - a.score)
        .slice(0, TRENDING_COUNT)
        .map(({ t }) => t);
    }),
  );

  return (
    <section aria-labelledby="trending-title">
      <h2 id="trending-title" className="mb-3 text-lg font-bold">
        🔥 Trending
      </h2>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
        {!loaded &&
          Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-44 w-56 shrink-0 animate-pulse rounded-xl border border-line bg-panel" />
          ))}
        {trending.map((token, i) => (
          <TrendingCard key={token.id} token={token} rank={i + 1} />
        ))}
      </div>
    </section>
  );
}

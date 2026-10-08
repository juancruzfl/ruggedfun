"use client";

import { isHouseToken, trendingScore, type MarketToken } from "@ruggedfun/shared";
import Link from "next/link";
import { memo } from "react";
import { useShallow } from "zustand/react/shallow";
import { formatSol, formatUsd } from "@/lib/format";
import { useMarket } from "@/lib/marketStore";
import { BuyButton } from "./BuyButton";
import { Sparkline } from "./Sparkline";
import { Change, StatusBadge, TokenAvatar } from "./TokenBits";

/** The #1 spotlight plus this many runners-up. */
const RUNNERS_UP = 5;

/** The #1 trending token, given room for a bigger chart and its 5m volume. */
const Spotlight = memo(function Spotlight({ token }: { token: MarketToken }) {
  // Washed in the color of its last 5 minutes, like the market's other direction cues.
  const down = token.change5m < 0;
  return (
    <div
      className={`relative flex flex-col rounded-xl border bg-linear-to-br to-panel to-60% p-4 transition hover:bg-panel-2 ${
        down ? "border-rug/30 from-rug/10 hover:border-rug/50" : "border-pump/30 from-pump/10 hover:border-pump/50"
      }`}
    >
      <Link href={`/token/${token.ticker}`} className="absolute inset-0 rounded-xl" aria-label={`${token.name} ($${token.ticker})`} />
      <div className="pointer-events-none flex items-center gap-3">
        <TokenAvatar src={token.imageUrl} alt="" size={56} />
        <div className="min-w-0 flex-1">
          <span className="rounded bg-pump/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-pump">#1 TRENDING</span>
          <div className="mt-1 flex items-center gap-2">
            <span className="truncate text-lg font-bold">{token.name}</span>
            <StatusBadge status={token.status} />
          </div>
          <div className="text-xs text-muted">${token.ticker}</div>
        </div>
      </div>

      <dl className="pointer-events-none mt-3 flex items-end gap-5">
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">Market cap</dt>
          <dd className="font-mono text-2xl font-bold">{formatUsd(token.marketCap)}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">5m</dt>
          <dd className="font-semibold">
            <Change value={token.change5m} />
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">5m vol</dt>
          <dd className="font-mono font-semibold">
            {formatSol(token.volume5m)} <span className="text-xs font-normal text-muted">SOL</span>
          </dd>
        </div>
      </dl>

      <Sparkline points={[...token.sparkline, token.price]} className="pointer-events-none mt-3 h-20 w-full" />
      <div className="pointer-events-none mt-3 flex justify-end">
        <BuyButton tokenId={token.id} ticker={token.ticker} className="px-4 py-1.5 text-sm" />
      </div>
    </div>
  );
});

/** A slim ranked line for trending #2 onward. The whole row opens the token; Buy sits above the link. */
const RunnerUp = memo(function RunnerUp({ token, rank }: { token: MarketToken; rank: number }) {
  return (
    <li className="relative flex flex-1 items-center gap-3 px-3 py-2.5 transition hover:bg-panel-2">
      <Link href={`/token/${token.ticker}`} className="absolute inset-0" aria-label={`#${rank} ${token.name} ($${token.ticker})`} />
      <span className="pointer-events-none w-4 shrink-0 text-center font-mono text-sm font-bold text-muted">{rank}</span>
      <TokenAvatar src={token.imageUrl} alt="" size={32} />
      <div className="pointer-events-none min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{token.name}</div>
        <div className="text-xs text-muted">${token.ticker}</div>
      </div>
      <Sparkline points={[...token.sparkline, token.price]} className="pointer-events-none hidden h-6 w-16 shrink-0 sm:block" />
      <div className="pointer-events-none w-20 shrink-0 text-right">
        <div className="font-mono text-sm font-semibold">{formatUsd(token.marketCap)}</div>
        <Change value={token.change5m} className="text-xs" />
      </div>
      <BuyButton tokenId={token.id} ticker={token.ticker} className="shrink-0 px-2.5 py-1 text-xs" />
    </li>
  );
});

/** Trending: the #1 token in a spotlight, the runners-up as a ranked list beside it. */
export function TrendingRow() {
  const loaded = useMarket((s) => s.loaded);
  const trending = useMarket(
    useShallow((s) => {
      const now = Date.now();
      return Object.values(s.tokens)
        // $RUGGEDFUN has its own spot above the row.
        .filter((t) => !isHouseToken(t))
        .map((t) => ({ t, score: trendingScore(t, now) }))
        .filter(({ score }) => score > -Infinity)
        .sort((a, b) => b.score - a.score)
        .slice(0, 1 + RUNNERS_UP)
        .map(({ t }) => t);
    }),
  );
  const [first, ...rest] = trending;

  return (
    <section aria-labelledby="trending-title">
      <h2 id="trending-title" className="mb-3 flex items-baseline gap-2 text-lg font-bold">
        🔥 Trending <span className="text-xs font-normal text-muted">last 5 minutes</span>
      </h2>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {!loaded ? (
          <>
            <div className="h-64 animate-pulse rounded-xl border border-line bg-panel" />
            <div className="h-64 animate-pulse rounded-xl border border-line bg-panel" />
          </>
        ) : first ? (
          <>
            <Spotlight token={first} />
            {rest.length > 0 && (
              // Rows share the height, so the list lines up with the spotlight beside it.
              <ol className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
                {rest.map((token, i) => (
                  <RunnerUp key={token.id} token={token} rank={i + 2} />
                ))}
              </ol>
            )}
          </>
        ) : (
          <p className="py-6 text-sm text-muted">Nothing's trending yet.</p>
        )}
      </div>
    </section>
  );
}

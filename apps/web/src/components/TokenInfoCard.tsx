"use client";

import { isHouseToken, type MarketToken, type TokenSummary } from "@ruggedfun/shared";
import type { ReactNode } from "react";
import { formatPct, formatSol, formatUsd, timeAgo } from "@/lib/format";
import { Price, StatusBadge, TokenAvatar } from "./TokenBits";
import { useFlash } from "./useFlash";

function Stat({ label, title, mono = true, children }: { label: string; title?: string; mono?: boolean; children: ReactNode }) {
  return (
    <div className="min-w-0" title={title}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`mt-0.5 flex items-center gap-1.5 truncate text-sm font-semibold ${mono ? "font-mono" : ""}`}>
        {children}
      </dd>
    </div>
  );
}

const Sol = () => <span className="text-xs font-normal text-muted">SOL</span>;

/**
 * The token page's header, in two parts: who the token is (name, ticker, description, age, dev) beside
 * its market cap against its all-time high, then the slower-moving numbers (price, liquidity, holders, volume).
 * Short-term changes live on the chart, not here.
 */
export function TokenInfoCard({
  token,
  live,
  volume,
  holders,
  now,
}: {
  token: TokenSummary;
  /** Present while the token is trading. */
  live?: MarketToken;
  volume: { total: number; day: number };
  holders: number | null;
  now: number;
}) {
  const gone = token.status === "rugged" || token.status === "dead";
  const flash = useFlash(token.marketCap);
  const athMcap = token.marketCap * (token.athPrice / token.price);
  const ofAth = athMcap > 0 ? Math.min(1, token.marketCap / athMcap) : 1;
  const atAth = ofAth >= 0.995;

  return (
    <section aria-labelledby="token-title" className="rounded-xl border border-line bg-panel">
      <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <TokenAvatar src={token.imageUrl} alt={token.name} size={64} dim={gone} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 id="token-title" className="truncate text-2xl font-bold">
                {token.name}
              </h1>
              <StatusBadge status={token.status} />
              {!live && (
                <span className="rounded bg-line px-1.5 py-0.5 text-[10px] font-bold text-muted">NOT TRADING</span>
              )}
            </div>
            <p className="font-mono text-sm text-muted">${token.ticker}</p>
            {token.description && <p className="mt-1 text-sm text-muted">{token.description}</p>}
          </div>
        </div>

        {/* Market cap, ATH, age and dev: one row beside the name on desktop, a 2x2 grid below it otherwise. */}
        <dl className="grid shrink-0 grid-cols-2 items-center gap-x-6 gap-y-3 border-t border-line pt-3 lg:flex lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">Market cap</dt>
            <dd
              className={`mt-0.5 rounded font-mono text-2xl font-bold tracking-tight ${
                flash === "up" ? "animate-flash-up" : flash === "down" ? "animate-flash-down" : ""
              }`}
            >
              {formatUsd(token.marketCap)}
            </dd>
          </div>

          <div className="min-w-0 lg:w-48">
            <dt className="flex items-baseline justify-between text-[11px]">
              <span className="font-medium uppercase tracking-wide text-muted">ATH</span>
              <span className="font-mono font-semibold">{formatUsd(athMcap)}</span>
            </dt>
            <dd>
              <div
                className="mt-1.5 h-2 overflow-hidden rounded-full bg-panel-2"
                role="progressbar"
                aria-label="Market cap as a share of its all-time high"
                aria-valuenow={Math.round(ofAth * 100)}
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ${atAth ? "bg-amber-300" : "bg-pump/70"}`}
                  style={{ width: `${ofAth * 100}%` }}
                />
              </div>
              <div className={`mt-1 text-right text-xs ${atAth ? "text-amber-300" : "text-muted"}`}>
                {atAth ? "🔥 At all-time high" : `${formatPct(ofAth - 1)} from ATH`}
              </div>
            </dd>
          </div>

          <Stat label="Created" mono={false}>
            {/* The exact time is in the tooltip; it's formatted in the viewer's timezone, so it can differ from the server render. */}
            <time
              dateTime={new Date(token.createdAt).toISOString()}
              title={new Date(token.createdAt).toLocaleString()}
              suppressHydrationWarning
            >
              {timeAgo(token.createdAt, now)} ago
            </time>
          </Stat>
          <Stat label="Dev" mono={false}>
            <span className="truncate">{token.creatorHandle}</span>
            {isHouseToken(token) ? (
              <span className="rounded bg-pump/15 px-1 text-[10px] font-bold text-pump">OFFICIAL</span>
            ) : (
              token.byPlayer && (
                <span className="rounded bg-sky-400/15 px-1 text-[10px] font-bold text-sky-300">PLAYER</span>
              )
            )}
          </Stat>
        </dl>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line px-4 py-3 sm:grid-cols-5">
        <Stat label="Price">
          <Price value={token.price} /> <Sol />
        </Stat>
        <Stat label="Liquidity" title="The SOL side of the bonding curve pool. Deeper liquidity = less price impact.">
          {live ? formatUsd(live.price * live.curve.virtualTokens) : "—"}
        </Stat>
        <Stat label="Holders">{holders === null ? "—" : holders.toLocaleString("en-US")}</Stat>
        <Stat label="24h vol">
          {formatSol(volume.day)} <Sol />
        </Stat>
        <Stat label="Total vol">
          {formatSol(volume.total)} <Sol />
        </Stat>
      </dl>
    </section>
  );
}

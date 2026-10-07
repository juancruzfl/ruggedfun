"use client";

import type { MarketToken, TokenSummary } from "@ruggedfun/shared";
import { CURVE, GRADUATION_PRICE, marketCapSol } from "@ruggedfun/sim";
import type { ReactNode } from "react";
import { formatPct, formatSol, formatTokens, formatUsd } from "@/lib/format";
import { Change, Price } from "./TokenBits";
import { useFlash } from "./useFlash";

/** Samples are 10s apart, so 6 back is about a minute ago. */
const ONE_MINUTE_SAMPLES = 6;

function change1m(live: MarketToken | undefined): number | undefined {
  if (!live || live.sparkline.length === 0) return undefined;
  const ref = live.sparkline[Math.max(0, live.sparkline.length - ONE_MINUTE_SAMPLES)]!;
  return live.price / ref - 1;
}

function StripStat({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <div className="min-w-0" title={title}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-sm font-semibold">{children}</dd>
    </div>
  );
}

/**
 * Market cap as the headline, its distance from the all-time high, and a strip of the
 * numbers traders glance at: price, short-term change and volume.
 */
export function MarketHero({
  token,
  live,
  volume,
  holders,
}: {
  token: TokenSummary;
  live?: MarketToken;
  volume: { total: number; day: number };
  holders: number | null;
}) {
  const flash = useFlash(token.marketCap);
  const athMcap = token.marketCap * (token.athPrice / token.price);
  const ofAth = athMcap > 0 ? Math.min(1, token.marketCap / athMcap) : 1;
  const atAth = ofAth >= 0.995;
  const c1m = change1m(live);
  const dir = !live ? "flat" : live.change5m >= 0.0005 ? "up" : live.change5m <= -0.0005 ? "down" : "flat";

  // The top of the card is washed in the color of the last 5 minutes, like the trending cards.
  return (
    <section
      aria-label="Market"
      className={`rounded-xl border border-line bg-panel ${
        dir === "up" ? "bg-linear-to-b from-pump/10 to-panel to-40%" : dir === "down" ? "bg-linear-to-b from-rug/10 to-panel to-40%" : ""
      }`}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 p-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted">Market cap</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              className={`rounded font-mono text-3xl font-bold tracking-tight ${
                flash === "up" ? "animate-flash-up" : flash === "down" ? "animate-flash-down" : ""
              }`}
            >
              {formatUsd(token.marketCap)}
            </span>
            {live && (
              <span
                className={`rounded-md px-1.5 py-0.5 font-mono text-sm font-semibold ${
                  { up: "bg-pump/15 text-pump", down: "bg-rug/15 text-rug", flat: "bg-panel-2 text-muted" }[dir]
                }`}
              >
                {dir !== "flat" && (
                  <span aria-hidden className="mr-0.5 text-[0.75em]">
                    {dir === "up" ? "▲" : "▼"}
                  </span>
                )}
                {formatPct(live.change5m)} <span className="text-xs font-normal opacity-70">5m</span>
              </span>
            )}
          </div>
        </div>

        <div className="w-full sm:w-64">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium uppercase tracking-wide text-muted">ATH</span>
            <span className="font-mono font-semibold">{formatUsd(athMcap)}</span>
          </div>
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
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-x-4 gap-y-3 border-t border-line px-4 py-3 sm:grid-cols-4">
        <StripStat label="Price">
          <Price value={token.price} /> <span className="text-xs font-normal text-muted">SOL</span>
        </StripStat>
        <StripStat
          label="Liquidity"
          title="The SOL side of the bonding curve pool. Deeper liquidity = less price impact."
        >
          {live ? formatUsd(live.price * live.curve.virtualTokens) : "—"}
        </StripStat>
        <StripStat label="Holders">{holders === null ? "—" : holders.toLocaleString("en-US")}</StripStat>
        <StripStat label="1m">{c1m === undefined ? "—" : <Change value={c1m} />}</StripStat>
        <StripStat label="5m">{live ? <Change value={live.change5m} /> : "—"}</StripStat>
        <StripStat label="5m vol">
          {live ? formatSol(live.volume5m) : "—"} <span className="text-xs font-normal text-muted">SOL</span>
        </StripStat>
        <StripStat label="24h vol">
          {formatSol(volume.day)} <span className="text-xs font-normal text-muted">SOL</span>
        </StripStat>
        <StripStat label="Total vol">
          {formatSol(volume.total)} <span className="text-xs font-normal text-muted">SOL</span>
        </StripStat>
      </dl>
    </section>
  );
}

const GRADUATION_MCAP = marketCapSol(GRADUATION_PRICE);

/** pump.fun-style curve card: progress to graduation and what's left, or how it ended. */
export function BondingCurveCard({ token }: { token: TokenSummary }) {
  // A graduated curve stays complete even if the price dips afterwards.
  const progress = token.status === "graduated" ? 1 : token.bondingProgress;
  const pct = Math.round(progress * 100);

  const state =
    token.status === "rugged"
      ? {
          title: "💀 Rugged",
          tone: "bg-rug/60",
          text: "The dev pulled the liquidity. This curve isn't going anywhere.",
        }
      : token.status === "dead"
        ? { title: "Trading stopped", tone: "bg-line", text: "Everyone left. This token is no longer trading." }
        : token.status === "graduated" || progress >= 1
          ? {
              title: "🎓 Graduated",
              tone: "bg-amber-300",
              text: "The curve is complete. Trading continues, but it can't graduate twice.",
            }
          : null;

  return (
    <section aria-labelledby="curve-title" className="rounded-xl border border-line bg-panel p-4">
      <div className="flex items-baseline justify-between">
        <h2 id="curve-title" className="font-semibold">
          {state?.title ?? "Bonding curve"}
        </h2>
        <span className="font-mono text-lg font-bold">{pct}%</span>
      </div>
      <div
        className="mt-2 h-3 overflow-hidden rounded-full bg-panel-2"
        role="progressbar"
        aria-label="Bonding curve progress"
        aria-valuenow={pct}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-700 ${
            state?.tone ?? "bg-linear-to-r from-pump/60 to-pump shadow-[0_0_12px] shadow-pump/40"
          }`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {state ? (
        <p className="mt-3 text-sm text-muted">{state.text}</p>
      ) : (
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-muted">To graduate</dt>
            <dd className="font-mono">
              {formatUsd(Math.max(0, GRADUATION_MCAP - token.marketCap))} <span className="text-muted">more</span>
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Graduates at</dt>
            <dd className="font-mono">{formatUsd(GRADUATION_MCAP)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Left on curve</dt>
            <dd className="font-mono">{formatTokens(CURVE.curveTokens * (1 - progress))} tokens</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

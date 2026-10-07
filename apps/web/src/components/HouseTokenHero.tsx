"use client";

import { isHouseToken } from "@ruggedfun/shared";
import Link from "next/link";
import { formatSol, formatUsd } from "@/lib/format";
import { useMarket } from "@/lib/marketStore";
import { BuyButton } from "./BuyButton";
import { Sparkline } from "./Sparkline";
import { Change, Price, TokenAvatar } from "./TokenBits";
import { useFlash } from "./useFlash";

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-sm font-semibold">{children}</dd>
    </div>
  );
}

/** $RUGGEDFUN, the launchpad's own token, featured at the top of the home page. */
export function HouseTokenHero() {
  const loaded = useMarket((s) => s.loaded);
  const token = useMarket((s) => Object.values(s.tokens).find(isHouseToken));
  const flash = useFlash(token?.marketCap ?? 0);

  if (!loaded) return <div className="h-48 animate-pulse rounded-2xl border border-line bg-panel" />;
  // The engine creates it on startup; until then there's nothing to feature.
  if (!token) return null;

  return (
    // The border fades green to red, the logo's two halves, like the top bar's bottom edge.
    <section
      aria-labelledby="house-title"
      className="rounded-2xl bg-linear-to-r from-pump/60 via-line to-rug/60 p-px shadow-lg shadow-pump/5"
    >
      <div className="grid gap-5 rounded-[calc(1rem-1px)] bg-panel bg-linear-to-br from-pump/[0.08] via-panel to-rug/[0.06] p-4 sm:p-5 lg:grid-cols-[1fr_minmax(0,22rem)] lg:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-4">
            <TokenAvatar src={token.imageUrl} alt="" size={72} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="house-title" className="text-2xl font-bold tracking-tight">
                  ${token.ticker}
                </h2>
                <span className="rounded bg-pump/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-pump">
                  OFFICIAL TOKEN
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">{token.description}</p>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">Market cap</dt>
              <dd className="mt-0.5 flex items-baseline gap-2">
                <span
                  className={`rounded font-mono text-2xl font-bold ${
                    flash === "up" ? "animate-flash-up" : flash === "down" ? "animate-flash-down" : ""
                  }`}
                >
                  {formatUsd(token.marketCap)}
                </span>
              </dd>
            </div>
            <Stat label="5m">
              <Change value={token.change5m} />
            </Stat>
            <Stat label="Price">
              <Price value={token.price} /> <span className="text-xs font-normal text-muted">SOL</span>
            </Stat>
            <Stat label="5m vol">
              {formatSol(token.volume5m)} <span className="text-xs font-normal text-muted">SOL</span>
            </Stat>
          </dl>
        </div>

        <div className="flex flex-col gap-3">
          {/* Its usual swings are ±10%, so a 5% dip shouldn't fill the chart like a rug. */}
          <Sparkline points={[...token.sparkline, token.price]} minRange={1.4} className="h-20 w-full" />
          <div className="flex gap-2">
            <BuyButton tokenId={token.id} ticker={token.ticker} className="flex-1 py-2.5 text-sm" />
            <Link
              href={`/token/${token.ticker}`}
              className="flex-1 rounded-md border border-line bg-panel-2 py-2.5 text-center text-sm font-semibold transition hover:border-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pump"
            >
              View chart
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

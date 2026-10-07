"use client";

import type { MarketToken, PositionSummary } from "@ruggedfun/shared";
import { CURVE, quoteTrade, spotPrice, tokensSold } from "@ruggedfun/sim";
import { useEffect, useRef, useState } from "react";
import { formatPct, formatSol, formatTokens, formatUsd } from "@/lib/format";
import { useShallow } from "zustand/react/shallow";
import { useMarket } from "@/lib/marketStore";
import { useFlash } from "./useFlash";

const MAX_POINTS = 300;

export interface PnlState {
  position: PositionSummary | undefined;
  /** Mark-to-market value of the tokens held. */
  value: number;
  unrealized: number;
  realized: number;
  total: number;
  /** Total PnL as a share of everything put in (cost still held + cost already sold). */
  pct: number;
}

/**
 * The player's PnL on one token: unrealized (held tokens at the live price) plus realized
 * (profit already taken on sells, from the server render plus sells made since).
 */
export function usePnl(
  tokenId: string,
  price: number,
  position: PositionSummary | undefined,
  username: string | undefined,
  initial: { realized: number; soldCost: number },
  renderedAt: number,
): PnlState {
  const session = useMarket(
    useShallow((s) => {
      let realized = 0;
      let soldCost = 0;
      for (const t of s.trades) {
        if (t.tokenId !== tokenId || t.isBot || t.trader !== username || t.at <= renderedAt) continue;
        if (t.realizedPnlSol === null) continue;
        realized += t.realizedPnlSol;
        soldCost += t.solAmount - t.realizedPnlSol;
      }
      return { realized, soldCost };
    }),
  );
  const realized = initial.realized + session.realized;
  const cost = position?.costBasisSol ?? 0;
  const value = (position?.tokenAmount ?? 0) * price;
  const unrealized = value - cost;
  const total = unrealized + realized;
  // Measure against everything put in: cost still held plus the cost of tokens already sold.
  const invested = cost + initial.soldCost + session.soldCost;
  return { position, value, unrealized, realized, total, pct: invested > 0 ? total / invested : 0 };
}

/** PnL over time since the page opened, with a zero line. */
function PnlLine({ points }: { points: number[] }) {
  const W = 100;
  const H = 36;
  if (points.length < 2) return <div className="h-9" aria-hidden />;
  const lo = Math.min(0, ...points);
  const hi = Math.max(0, ...points);
  const span = hi - lo || 1;
  const y = (v: number) => H - 2 - ((v - lo) / span) * (H - 4);
  const coords = points.map((v, i) => `${(i / (points.length - 1)) * W},${y(v)}`).join(" ");
  const up = points.at(-1)! >= 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-9 w-full" aria-hidden>
      <line
        x1="0"
        x2={W}
        y1={y(0)}
        y2={y(0)}
        className="stroke-line"
        strokeDasharray="2 2"
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={coords}
        fill="none"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        className={up ? "stroke-pump" : "stroke-rug"}
      />
    </svg>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-mono">{children}</dd>
    </div>
  );
}

export function LivePnlCard({ live, ticker, pnl }: { live: MarketToken | undefined; ticker: string; pnl: PnlState }) {
  const { position, value, realized, total, pct } = pnl;
  const flash = useFlash(value, 0.01);
  const [history, setHistory] = useState<number[]>([]);
  const last = useRef<number | null>(null);

  // Sample whenever the total moves.
  useEffect(() => {
    if (last.current !== null && Math.abs(last.current - total) < 1e-12) return;
    last.current = total;
    setHistory((h) => [...h, total].slice(-MAX_POINTS));
  }, [total]);

  let sellNow: number | null = null;
  if (live && live.endedAt === null && position) {
    try {
      const amount = Math.min(position.tokenAmount, tokensSold(live.curve));
      if (amount > 0) sellNow = quoteTrade(live.curve, live.price / spotPrice(live.curve), "sell", amount).solAmount;
    } catch {
      sellNow = null;
    }
  }

  const avgEntryMcap = position ? (position.costBasisSol / position.tokenAmount) * CURVE.totalSupply : null;
  const tone = total > 0 ? "text-pump" : total < 0 ? "text-rug" : "text-muted";

  return (
    <section aria-labelledby="pnl-title" className="rounded-xl border border-line bg-panel p-4">
      <div className="flex items-center justify-between">
        <h2 id="pnl-title" className="font-semibold">
          Your PnL
        </h2>
        {live && live.endedAt === null && (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-pump">
            <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-pump" />
            Live
          </span>
        )}
      </div>

      <div className={`mt-2 flex flex-wrap items-baseline gap-x-2 ${tone}`}>
        <span
          className={`rounded font-mono text-2xl font-bold ${
            flash === "up" ? "animate-flash-up" : flash === "down" ? "animate-flash-down" : ""
          }`}
        >
          {total >= 0 ? "+" : "−"}
          {formatSol(Math.abs(total))} SOL
        </span>
        <span className="font-mono text-sm font-semibold">{formatPct(pct)}</span>
      </div>
      <div className="text-xs text-muted">
        ≈ {total >= 0 ? "+" : "−"}
        {formatUsd(Math.abs(total))}
      </div>

      <div className="mt-2">
        <PnlLine points={history} />
      </div>

      <dl className="mt-3 space-y-1.5 text-sm">
        {position ? (
          <>
            <Row label="Holding">
              {formatTokens(position.tokenAmount)} ${ticker}
            </Row>
            <Row label="Avg entry">{avgEntryMcap !== null ? `${formatUsd(avgEntryMcap)} MC` : "—"}</Row>
            <Row label="Value now">{formatSol(value)} SOL</Row>
            <Row label="Cost">{formatSol(position.costBasisSol)} SOL</Row>
          </>
        ) : (
          <Row label="Position">closed</Row>
        )}
        {realized !== 0 && (
          <Row label="Realized">
            <span className={realized > 0 ? "text-pump" : "text-rug"}>
              {realized > 0 ? "+" : "−"}
              {formatSol(Math.abs(realized))} SOL
            </span>
          </Row>
        )}
        {sellNow !== null && (
          <Row label="Sell all now">
            <span className="text-text">≈ {formatSol(sellNow)} SOL</span>
          </Row>
        )}
      </dl>
    </section>
  );
}

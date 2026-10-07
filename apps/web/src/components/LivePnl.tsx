"use client";

import type { MarketToken, PositionSummary } from "@ruggedfun/shared";
import { CURVE } from "@ruggedfun/sim";
import { useEffect, useRef, useState } from "react";
import { formatPct, formatSol, formatTokens, formatUsd } from "@/lib/format";
import { positionValue } from "@/lib/positionValue";
import type { TokenFlows } from "@/lib/tokens";
import { useFlash } from "./useFlash";

const MAX_POINTS = 300;

export interface PnlState {
  position: PositionSummary | undefined;
  /** SOL spent on buys. */
  invested: number;
  /** SOL received from sells. */
  sold: number;
  /** What the tokens still held would sell for right now (price impact and fee included). */
  held: number;
  /** sold + held. */
  value: number;
  /** value − invested. */
  total: number;
  /** total / invested. */
  pct: number;
  /** Average market cap paid across all buys. */
  avgEntryMcap: number | null;
}

/**
 * The player's PnL on one token as cash in vs. cash out: Value (SOL already taken out by selling
 * plus what's held would sell for now) minus Invested (SOL put in). Held is valued at sell value,
 * not tokens × price: on a thin curve your own buy pushes the price up, and that isn't profit.
 * Flows = the server render's totals plus the player's own trades since (see useTokenTrades).
 */
export function usePnl(
  live: MarketToken | undefined,
  lastPrice: number,
  position: PositionSummary | undefined,
  initial: TokenFlows,
  session: TokenFlows,
): PnlState {
  const invested = initial.boughtSol + session.boughtSol;
  const boughtTokens = initial.boughtTokens + session.boughtTokens;
  const sold = initial.soldSol + session.soldSol;
  const held = position ? positionValue(position.tokenAmount, live, lastPrice) : 0;
  const value = sold + held;
  const total = value - invested;
  return {
    position,
    invested,
    sold,
    held,
    value,
    total,
    pct: invested > 0 ? total / invested : 0,
    avgEntryMcap: boughtTokens > 0 ? (invested / boughtTokens) * CURVE.totalSupply : null,
  };
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

function Row({
  label,
  hint,
  children,
  strong = false,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2">
      <dt className={strong ? "font-semibold" : "text-muted"}>
        {label}
        {hint && <span className="ml-1 text-xs font-normal text-muted">{hint}</span>}
      </dt>
      <dd className={`text-right font-mono ${strong ? "font-semibold" : ""}`}>{children}</dd>
    </div>
  );
}

export function LivePnlCard({ live, ticker, pnl }: { live: MarketToken | undefined; ticker: string; pnl: PnlState }) {
  const { position, invested, sold, held, value, total, pct, avgEntryMcap } = pnl;
  const flash = useFlash(value, 0.01);
  const [history, setHistory] = useState<number[]>([]);
  const last = useRef<number | null>(null);

  // Sample whenever the total moves.
  useEffect(() => {
    if (last.current !== null && Math.abs(last.current - total) < 1e-12) return;
    last.current = total;
    setHistory((h) => [...h, total].slice(-MAX_POINTS));
  }, [total]);

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
        <Row label="Avg entry">{avgEntryMcap !== null ? `${formatUsd(avgEntryMcap)} MC` : "—"}</Row>
        <Row label="Invested">{formatSol(invested)} SOL</Row>
        <Row label="Sold">{formatSol(sold)} SOL</Row>
        <Row label="Held" hint={position ? `${formatTokens(position.tokenAmount)} $${ticker}` : "none"}>
          {formatSol(held)} SOL
        </Row>
        <div className="border-t border-line pt-1.5">
          <Row label="Value" hint="sold + held" strong>
            {formatSol(value)} SOL
          </Row>
        </div>
      </dl>
      {position && live && live.endedAt === null && (
        <p className="mt-2 text-[11px] text-muted">
          Held = what selling it all right now would return, after fees and price impact.
        </p>
      )}
    </section>
  );
}

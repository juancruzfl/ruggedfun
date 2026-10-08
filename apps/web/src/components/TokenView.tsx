"use client";

import type { TokenSummary } from "@ruggedfun/shared";
import { useEffect, useMemo, useState } from "react";
import { formatPct, formatSol } from "@/lib/format";
import { useMarket } from "@/lib/marketStore";
import { useQuickTrade } from "@/lib/quickTrade";
import type { ListedTrade, TokenFlows } from "@/lib/tokens";
import { getSocket } from "@/lib/socket";
import { useHolders } from "@/lib/useHolders";
import { useTokenTrades } from "@/lib/useTokenTrades";
import { useNow } from "@/lib/useNow";
import { LivePnlCard, usePnl, type PnlState } from "./LivePnl";
import { BondingCurveCard } from "./MarketStats";
import { PriceChart, type ChartInterval, type ChartMode } from "./PriceChart";
import { useSession } from "./SessionProvider";
import { LiveChat } from "./LiveChat";
import { TokenActivity } from "./TokenActivity";
import { TokenInfoCard } from "./TokenInfoCard";
import { TradeForm } from "./TradeForm";

const INTERVALS: { value: ChartInterval; label: string }[] = [
  { value: 1, label: "1s" },
  { value: 5, label: "5s" },
  { value: 60, label: "1m" },
  { value: 300, label: "5m" },
  { value: 86400, label: "1d" },
];

const MODES: { value: ChartMode; label: string }[] = [
  { value: "mcap", label: "Market cap" },
  { value: "price", label: "Price" },
];

/** The token page: live stats, chart, trade panel, your live PnL and the activity tabs. */
export function TokenView({
  initial,
  initialTrades,
  initialVolume,
  initialFlows,
  renderedAt,
}: {
  initial: TokenSummary;
  initialTrades: ListedTrade[];
  initialVolume: { total: number; day: number };
  /** The signed-in player's buys and sells on this token so far. */
  initialFlows: TokenFlows;
  renderedAt: number;
}) {
  const live = useMarket((s) => s.tokens[initial.id]);
  const { me } = useSession();
  const [interval, setInterval] = useState<ChartInterval>(5);
  const [mode, setMode] = useState<ChartMode>("mcap");
  const token = live ?? initial;
  const now = useNow(renderedAt);

  // Ask the engine for this token's candles while the page is open.
  useEffect(() => {
    const socket = getSocket();
    const subscribe = () => socket.emit("token:subscribe", initial.id);
    subscribe();
    socket.on("connect", subscribe);
    return () => {
      socket.off("connect", subscribe);
      socket.emit("token:unsubscribe", initial.id);
    };
  }, [initial.id]);

  const session = useTokenTrades(initial.id, me?.user.username, renderedAt);
  const trades = useMemo(() => {
    const seen = new Set(session.trades.map((t) => t.id));
    return [...session.trades, ...initialTrades.filter((t) => !seen.has(t.id))].slice(0, 50);
  }, [session.trades, initialTrades]);

  // Trades since the page rendered count toward both (a page isn't open for 24 hours).
  const volume = { total: initialVolume.total + session.volume, day: initialVolume.day + session.volume };
  const holders = useHolders(initial.id);

  const position = me?.positions.find((p) => p.tokenId === initial.id);
  const gone = token.status === "rugged" || token.status === "dead";
  const openTrade = useQuickTrade((s) => s.open);
  const canBuy = Boolean(live) && live!.endedAt === null && !gone;
  const canSell = Boolean(live) && live!.endedAt === null && Boolean(position);
  const pnl = usePnl(live, token.price, position, initialFlows, session.mine);
  const showPnl = Boolean(position) || pnl.invested > 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-20 lg:pb-6">
      <TokenInfoCard token={token} live={live} volume={volume} holders={holders?.count ?? null} now={now} />

      {/*
        Two independent columns on desktop: the side column spans both rows, so a tall trade/PnL/curve
        stack no longer pushes the trades table down and leaves a gap under the chart. On phones it's
        one column: market and chart, the trade side, then the trades table.
      */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px] lg:grid-rows-[auto_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <section aria-label="Chart" className="flex flex-col rounded-xl border border-line bg-panel p-3">
            {/* Candle size on the left, what's plotted (market cap or price, both USD on a log scale) on the right. */}
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div role="tablist" aria-label="Candle size" className="flex gap-1">
                {INTERVALS.map((i) => (
                  <button
                    key={i.value}
                    role="tab"
                    aria-selected={interval === i.value}
                    onClick={() => setInterval(i.value)}
                    className={`rounded px-2 py-0.5 font-mono text-xs focus-visible:outline-2 focus-visible:outline-pump ${
                      interval === i.value ? "bg-pump/15 font-semibold text-pump" : "text-muted hover:text-text"
                    }`}
                  >
                    {i.label}
                  </button>
                ))}
              </div>
              <div role="radiogroup" aria-label="Chart shows" className="flex rounded-md bg-bg p-0.5">
                {MODES.map((m) => (
                  <button
                    key={m.value}
                    role="radio"
                    aria-checked={mode === m.value}
                    onClick={() => setMode(m.value)}
                    className={`rounded px-2 py-0.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-pump ${
                      mode === m.value ? "bg-panel-2 text-text shadow-sm" : "text-muted hover:text-text"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-[380px] flex-1">
              <PriceChart tokenId={initial.id} interval={interval} mode={mode} />
            </div>
            {interval === 1 && <p className="mt-1 text-[11px] text-muted">1s candles are built live from now.</p>}
          </section>
        </div>

        <aside className="space-y-4 lg:row-span-2">
          <section aria-label="Trade" className="rounded-xl border border-line bg-panel p-4">
            <TradeForm tokenId={initial.id} ticker={token.ticker} />
          </section>

          {showPnl && <LivePnlCard live={live} ticker={token.ticker} pnl={pnl} />}

          <BondingCurveCard token={token} />

          <LiveChat tokenId={initial.id} ticker={token.ticker} username={me?.user.username} />
        </aside>

        <div className="min-w-0 lg:col-start-1 lg:self-start">
          <TokenActivity
            holders={holders}
            tokenId={initial.id}
            ticker={token.ticker}
            price={token.price}
            trades={trades}
            me={me?.user.username}
            now={now}
          />
        </div>
      </div>

      <MobileTradeBar
        canBuy={canBuy}
        canSell={canSell}
        pnl={showPnl ? pnl : null}
        onTrade={(side) => openTrade(initial.id, side)}
      />
    </div>
  );
}

/** Phones and tablets: the trade panel is below the chart, so keep Buy / Sell one tap away. */
function MobileTradeBar({
  canBuy,
  canSell,
  pnl,
  onTrade,
}: {
  canBuy: boolean;
  canSell: boolean;
  pnl: PnlState | null;
  onTrade: (side: "buy" | "sell") => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-[5.25rem] z-20 border-t border-line bg-bg/95 p-2 backdrop-blur md:bottom-9 lg:hidden">
      {pnl && (
        <div className="mb-1.5 flex items-baseline justify-between px-1 text-xs">
          <span className="text-muted">Your PnL</span>
          <span
            className={`font-mono font-semibold ${pnl.total > 0 ? "text-pump" : pnl.total < 0 ? "text-rug" : "text-muted"}`}
          >
            {pnl.total >= 0 ? "+" : "−"}
            {formatSol(Math.abs(pnl.total))} SOL ({formatPct(pnl.pct)})
          </span>
        </div>
      )}
      <div className="flex gap-2">
        <button
          disabled={!canBuy}
          onClick={() => onTrade("buy")}
          className="flex-1 rounded-lg bg-pump py-2.5 font-bold text-pump-ink disabled:bg-panel-2 disabled:text-muted"
        >
          Buy
        </button>
        <button
          disabled={!canSell}
          onClick={() => onTrade("sell")}
          className="flex-1 rounded-lg bg-rug py-2.5 font-bold text-rug-ink disabled:bg-panel-2 disabled:text-muted"
        >
          Sell
        </button>
      </div>
    </div>
  );
}

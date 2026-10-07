"use client";

import type { TokenSummary } from "@ruggedfun/shared";
import { useEffect, useMemo, useState } from "react";
import { formatPct, formatSol, timeAgo } from "@/lib/format";
import { useMarket } from "@/lib/marketStore";
import { useQuickTrade } from "@/lib/quickTrade";
import type { ListedTrade, TokenFlows } from "@/lib/tokens";
import { getSocket } from "@/lib/socket";
import { useHolders } from "@/lib/useHolders";
import { useNow } from "@/lib/useNow";
import { LivePnlCard, usePnl, type PnlState } from "./LivePnl";
import { BondingCurveCard, MarketHero } from "./MarketStats";
import { PriceChart, type ChartInterval } from "./PriceChart";
import { useSession } from "./SessionProvider";
import { LiveChat } from "./LiveChat";
import { TokenActivity } from "./TokenActivity";
import { StatusBadge, TokenAvatar } from "./TokenBits";
import { TradeForm } from "./TradeForm";

const INTERVALS: { value: ChartInterval; label: string }[] = [
  { value: 1, label: "1s" },
  { value: 5, label: "5s" },
  { value: 60, label: "1m" },
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
  const liveTrades = useMarket((s) => s.trades);
  const { me } = useSession();
  const [interval, setInterval] = useState<ChartInterval>(5);
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

  const trades = useMemo(() => {
    const fresh = liveTrades.filter((t) => t.tokenId === initial.id);
    const seen = new Set(fresh.map((t) => t.id));
    return [...fresh, ...initialTrades.filter((t) => !seen.has(t.id))].slice(0, 50);
  }, [liveTrades, initialTrades, initial.id]);

  // Trades since the page rendered count toward both (a page isn't open for 24 hours).
  const sinceRender = liveTrades
    .filter((t) => t.tokenId === initial.id && t.at > renderedAt)
    .reduce((sum, t) => sum + t.solAmount, 0);
  const volume = { total: initialVolume.total + sinceRender, day: initialVolume.day + sinceRender };
  const holders = useHolders(initial.id);

  const position = me?.positions.find((p) => p.tokenId === initial.id);
  const gone = token.status === "rugged" || token.status === "dead";
  const openTrade = useQuickTrade((s) => s.open);
  const canBuy = Boolean(live) && live!.endedAt === null && !gone;
  const canSell = Boolean(live) && live!.endedAt === null && Boolean(position);
  const pnl = usePnl(initial.id, live, token.price, position, me?.user.username, initialFlows, renderedAt);
  const showPnl = Boolean(position) || pnl.invested > 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-20 lg:pb-6">
      <header className="flex flex-wrap items-center gap-4">
        <TokenAvatar src={token.imageUrl} alt={token.name} size={64} dim={gone} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-bold">{token.name}</h1>
            <StatusBadge status={token.status} />
            {!live && (
              <span className="rounded bg-line px-1.5 py-0.5 text-[10px] font-bold text-muted">NOT TRADING</span>
            )}
          </div>
          <div className="text-sm text-muted">
            ${token.ticker} · created {timeAgo(token.createdAt, now)} ago by {token.creatorHandle}
          </div>
          <p className="mt-1 text-sm text-muted">{token.description}</p>
        </div>
      </header>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <MarketHero token={token} live={live} volume={volume} holders={holders?.count ?? null} />

          <section aria-label="Chart" className="flex flex-col rounded-xl border border-line bg-panel p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-muted">Market cap (USD, log)</span>
              <div role="tablist" className="flex gap-1">
                {INTERVALS.map((i) => (
                  <button
                    key={i.value}
                    role="tab"
                    aria-selected={interval === i.value}
                    onClick={() => setInterval(i.value)}
                    className={`rounded px-2 py-0.5 font-mono text-xs ${
                      interval === i.value ? "bg-panel-2 text-text" : "text-muted hover:text-text"
                    }`}
                  >
                    {i.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-[380px] flex-1">
              <PriceChart tokenId={initial.id} interval={interval} />
            </div>
            {interval === 1 && <p className="mt-1 text-[11px] text-muted">1s candles are built live from now.</p>}
          </section>
        </div>

        <aside className="space-y-4">
          <section aria-label="Trade" className="rounded-xl border border-line bg-panel p-4">
            <TradeForm tokenId={initial.id} ticker={token.ticker} />
          </section>

          {showPnl && <LivePnlCard live={live} ticker={token.ticker} pnl={pnl} />}

          <BondingCurveCard token={token} />
        </aside>
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1fr_340px]">
        <TokenActivity
          holders={holders}
          tokenId={initial.id}
          ticker={token.ticker}
          price={token.price}
          trades={trades}
          me={me?.user.username}
          now={now}
        />
        <LiveChat tokenId={initial.id} ticker={token.ticker} username={me?.user.username} />
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
          className="flex-1 rounded-lg bg-pump py-2.5 font-bold text-black disabled:opacity-40"
        >
          Buy
        </button>
        <button
          disabled={!canSell}
          onClick={() => onTrade("sell")}
          className="flex-1 rounded-lg bg-rug py-2.5 font-bold text-black disabled:opacity-40"
        >
          Sell
        </button>
      </div>
    </div>
  );
}

"use client";

import type { TokenSummary, TradeEvent } from "@ruggedfun/shared";
import { useEffect, useMemo, useState } from "react";
import { formatPct, formatSol, formatTokens, formatUsd, timeAgo } from "@/lib/format";
import { useMarket } from "@/lib/marketStore";
import { getSocket } from "@/lib/socket";
import { useNow } from "@/lib/useNow";
import { PriceChart, type ChartInterval } from "./PriceChart";
import { useSession } from "./SessionProvider";
import { Change, Price, ProgressBar, StatusBadge, TokenAvatar } from "./TokenBits";
import { TradeForm } from "./TradeForm";
import { TraderName } from "./TraderName";

type ListedTrade = Omit<TradeEvent, "priceAfter" | "curve">;

const INTERVALS: { value: ChartInterval; label: string }[] = [
  { value: 1, label: "1s" },
  { value: 5, label: "5s" },
  { value: 60, label: "1m" },
];

/** The token page: live stats, chart, trade panel, your position and the trade list. */
export function TokenView({
  initial,
  initialTrades,
  initialVolumeSol,
  renderedAt,
}: {
  initial: TokenSummary;
  initialTrades: ListedTrade[];
  initialVolumeSol: number;
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

  const volumeSol =
    initialVolumeSol +
    liveTrades.filter((t) => t.tokenId === initial.id && t.at > renderedAt).reduce((sum, t) => sum + t.solAmount, 0);

  const position = me?.positions.find((p) => p.tokenId === initial.id);
  const gone = token.status === "rugged" || token.status === "dead";
  const change5m = live?.change5m;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="flex flex-wrap items-center gap-4">
        <TokenAvatar src={token.imageUrl} alt={token.name} size={64} dim={gone} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-bold">{token.name}</h1>
            <StatusBadge status={token.status} />
            {!live && <span className="rounded bg-line px-1.5 py-0.5 text-[10px] font-bold text-muted">NOT TRADING</span>}
          </div>
          <div className="text-sm text-muted">
            ${token.ticker} · created {timeAgo(token.createdAt, now)} ago by {token.creatorHandle}
          </div>
          <p className="mt-1 text-sm text-muted">{token.description}</p>
        </div>
      </header>

      <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Market cap" value={formatUsd(token.marketCap)} big />
        <Stat label="Price" value={<><Price value={token.price} /> SOL</>} />
        <Stat label="5m" value={change5m === undefined ? "—" : <Change value={change5m} />} />
        <Stat label="ATH" value={formatUsd(token.marketCap * (token.athPrice / token.price))} />
        <Stat label="Volume" value={`${formatSol(volumeSol)} SOL`} />
        <div className="rounded-xl border border-line bg-panel p-3">
          <dt className="text-xs text-muted">Bonding curve</dt>
          <dd className="mt-2 flex items-center gap-2">
            <ProgressBar value={token.bondingProgress} />
            <span className="font-mono text-xs">{Math.round(token.bondingProgress * 100)}%</span>
          </dd>
        </div>
      </dl>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
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

        <aside className="space-y-4">
          <section aria-label="Trade" className="rounded-xl border border-line bg-panel p-4">
            <TradeForm tokenId={initial.id} />
          </section>

          {position && (
            <section aria-label="Your position" className="rounded-xl border border-line bg-panel p-4 text-sm">
              <h2 className="mb-2 font-semibold">Your position</h2>
              <PositionStats tokens={position.tokenAmount} cost={position.costBasisSol} price={token.price} ticker={token.ticker} />
            </section>
          )}
        </aside>
      </div>

      <section aria-labelledby="trades-title" className="mt-4 rounded-xl border border-line bg-panel">
        <h2 id="trades-title" className="border-b border-line px-4 py-3 font-semibold">
          Trades
        </h2>
        {trades.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">No trades yet. Be the first to ape in.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Trader</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 text-right font-medium">SOL</th>
                  <th className="px-4 py-2 text-right font-medium">${token.ticker}</th>
                  <th className="px-4 py-2 text-right font-medium">Age</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr
                    key={t.id}
                    className={`border-t border-line ${!t.isBot && t.trader === me?.user.username ? "bg-pump/5" : ""}`}
                  >
                    <td className="max-w-48 px-4 py-2">
                      <TraderName trade={t} me={me?.user.username} />
                    </td>
                    <td className={`px-4 py-2 font-semibold ${t.side === "buy" ? "text-pump" : "text-rug"}`}>
                      {t.side.toUpperCase()}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">{formatSol(t.solAmount)}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatTokens(t.tokenAmount)}</td>
                    <td className="px-4 py-2 text-right text-muted">{timeAgo(t.at, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, big = false }: { label: string; value: React.ReactNode; big?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-1 font-mono font-semibold ${big ? "text-lg text-pump" : ""}`}>{value}</dd>
    </div>
  );
}

/** Value is at the current price; selling it all would get a little less because of price impact. */
export function PositionStats({ tokens, cost, price, ticker }: { tokens: number; cost: number; price: number; ticker: string }) {
  const value = tokens * price;
  const pnl = value - cost;
  return (
    <dl className="grid grid-cols-2 gap-y-1">
      <dt className="text-muted">Holding</dt>
      <dd className="text-right font-mono">
        {formatTokens(tokens)} ${ticker}
      </dd>
      <dt className="text-muted">Value</dt>
      <dd className="text-right font-mono">{formatSol(value)} SOL</dd>
      <dt className="text-muted">Cost</dt>
      <dd className="text-right font-mono">{formatSol(cost)} SOL</dd>
      <dt className="text-muted">PnL</dt>
      <dd className={`text-right font-mono font-semibold ${pnl >= 0 ? "text-pump" : "text-rug"}`}>
        {pnl >= 0 ? "+" : ""}
        {formatSol(pnl)} SOL ({formatPct(cost > 0 ? pnl / cost : 0)})
      </dd>
    </dl>
  );
}

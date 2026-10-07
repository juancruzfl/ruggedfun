"use client";

import { useState } from "react";
import { CURVE } from "@ruggedfun/sim";
import { formatSol, formatTokens, formatUsd, timeAgo } from "@/lib/format";
import type { Holder, ListedTrade } from "@/lib/tokens";
import type { HolderData } from "@/lib/useHolders";
import { TraderName } from "./TraderName";

const TABS = ["trades", "holders"] as const;
type Tab = (typeof TABS)[number];

/** Trades / Holders for one token. */
export function TokenActivity({
  tokenId,
  ticker,
  price,
  trades,
  holders,
  me,
  now,
}: {
  tokenId: string;
  holders: HolderData | null;
  ticker: string;
  price: number;
  trades: ListedTrade[];
  me: string | undefined;
  now: number;
}) {
  const [tab, setTab] = useState<Tab>("trades");

  const labels: Record<Tab, React.ReactNode> = {
    trades: "Trades",
    holders: <>Holders{holders ? <span className="ml-1 font-mono text-xs opacity-70">{holders.count}</span> : null}</>,
  };

  return (
    <section aria-label="Activity" className="min-w-0 rounded-xl border border-line bg-panel">
      <div role="tablist" className="flex gap-1 border-b border-line px-2">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            id={`activity-tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`activity-panel-${t}`}
            onClick={() => setTab(t)}
            className={`relative px-3 py-3 text-sm font-semibold transition ${
              tab === t ? "text-text" : "text-muted hover:text-text"
            }`}
          >
            {labels[t]}
            {tab === t && <span aria-hidden className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-pump" />}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`activity-panel-${tab}`} aria-labelledby={`activity-tab-${tab}`}>
        {tab === "trades" && <TradesTable trades={trades} ticker={ticker} me={me} now={now} />}
        {tab === "holders" && <HoldersTable data={holders} ticker={ticker} price={price} me={me} />}
      </div>
    </section>
  );
}

function TradesTable({
  trades,
  ticker,
  me,
  now,
}: {
  trades: ListedTrade[];
  ticker: string;
  me: string | undefined;
  now: number;
}) {
  if (trades.length === 0)
    return <p className="px-4 py-8 text-center text-sm text-muted">No trades yet. Be the first to ape in.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="px-2 py-2 sm:px-4 font-medium">Trader</th>
            <th className="px-2 py-2 sm:px-4 font-medium">Type</th>
            <th className="px-2 py-2 sm:px-4 text-right font-medium" title="Market cap at the trade's fill price">
              MC
            </th>
            <th className="px-2 py-2 sm:px-4 text-right font-medium">SOL</th>
            <th className="hidden px-2 py-2 sm:px-4 text-right font-medium sm:table-cell">${ticker}</th>
            <th className="px-2 py-2 sm:px-4 text-right font-medium">Age</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id} className={`border-t border-line ${!t.isBot && t.trader === me ? "bg-pump/5" : ""}`}>
              <td className="max-w-28 px-2 py-2 sm:max-w-48 sm:px-4">
                <TraderName trade={t} me={me} />
              </td>
              <td className={`px-2 py-2 sm:px-4 font-semibold ${t.side === "buy" ? "text-pump" : "text-rug"}`}>
                {t.isDev && t.side === "sell" ? "RUG" : t.side.toUpperCase()}
              </td>
              <td className="px-2 py-2 sm:px-4 text-right font-mono">{formatUsd(t.price * CURVE.totalSupply)}</td>
              <td className="px-2 py-2 sm:px-4 text-right font-mono">{formatSol(t.solAmount)}</td>
              <td className="hidden px-2 py-2 sm:px-4 text-right font-mono sm:table-cell">
                {formatTokens(t.tokenAmount)}
              </td>
              <td className="px-2 py-2 sm:px-4 text-right text-muted">{timeAgo(t.at, now)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HoldersTable({
  data,
  ticker,
  price,
  me,
}: {
  data: HolderData | null;
  ticker: string;
  price: number;
  me: string | undefined;
}) {
  if (!data) return <p className="px-4 py-8 text-center text-sm text-muted">Loading holders…</p>;
  if (data.holders.length === 0)
    return <p className="px-4 py-8 text-center text-sm text-muted">No one holds ${ticker} right now.</p>;
  const top = data.holders[0]!.supplyShare;
  const row = (h: Holder) => (
    <tr key={h.trader} className={`border-t border-line ${!h.isBot && h.trader === me ? "bg-pump/5" : ""}`}>
      <td className="px-4 py-2 font-mono text-muted">{h.rank}</td>
      <td className="max-w-48 px-4 py-2">
        <TraderName trade={h} me={me} />
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-panel-2 sm:w-24" aria-hidden>
            <div
              className={`h-full rounded-full ${h.isDev ? "bg-amber-300" : "bg-pump/70"}`}
              style={{ width: `${Math.min(1, h.supplyShare / top) * 100}%` }}
            />
          </div>
          <span className="font-mono">{(h.supplyShare * 100).toFixed(2)}%</span>
        </div>
      </td>
      <td className="hidden px-4 py-2 text-right font-mono sm:table-cell">{formatTokens(h.tokenAmount)}</td>
      <td className="px-4 py-2 text-right font-mono">{formatSol(h.tokenAmount * price)} SOL</td>
    </tr>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="w-10 px-4 py-2 font-medium">#</th>
            <th className="px-4 py-2 font-medium">Holder</th>
            <th className="px-4 py-2 font-medium">% of supply</th>
            <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">${ticker}</th>
            <th className="px-4 py-2 text-right font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {data.holders.map(row)}
          {data.mine && (
            <>
              <tr aria-hidden>
                <td colSpan={5} className="border-t border-line py-1 text-center text-muted">
                  ⋮
                </td>
              </tr>
              {row(data.mine)}
            </>
          )}
        </tbody>
      </table>
      {data.count > data.holders.length && (
        <p className="border-t border-line px-4 py-2 text-center text-xs text-muted">
          Top {data.holders.length} of {data.count} holders · refreshes every 10s
        </p>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { formatSol, formatTokens, timeAgo } from "@/lib/format";
import { useMarket } from "@/lib/marketStore";
import type { ListedTrade } from "@/lib/tokens";
import { useNow } from "@/lib/useNow";
import { BuyButton } from "./BuyButton";
import { useSession } from "./SessionProvider";
import { TokenAvatar } from "./TokenBits";
import { TraderName } from "./TraderName";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "buys", label: "Buys" },
  { id: "sells", label: "Sells" },
  { id: "whales", label: "🐋 ≥ 1 SOL" },
  { id: "mine", label: "Mine" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

const MAX_ROWS = 100;
const WHALE_SOL = 1;

/** Every trade on every token, newest on top. Hovering the list pauses it so rows can be clicked. */
export function LiveFeed({ initial, renderedAt }: { initial: ListedTrade[]; renderedAt: number }) {
  const liveTrades = useMarket((s) => s.trades);
  const tokens = useMarket((s) => s.tokens);
  const { me } = useSession();
  const [filter, setFilter] = useState<Filter>("all");
  const [paused, setPaused] = useState(false);
  const frozen = useRef<ListedTrade[] | null>(null);
  const now = useNow(renderedAt);

  const all = useMemo(() => {
    const seen = new Set(liveTrades.map((t) => t.id));
    return [...liveTrades, ...initial.filter((t) => !seen.has(t.id))];
  }, [liveTrades, initial]);

  const matches = (t: ListedTrade) => {
    switch (filter) {
      case "buys":
        return t.side === "buy";
      case "sells":
        return t.side === "sell";
      case "whales":
        return t.solAmount >= WHALE_SOL;
      case "mine":
        return !t.isBot && t.trader === me?.user.username;
      default:
        return true;
    }
  };

  const current = all.filter(matches).slice(0, MAX_ROWS);
  if (!paused) frozen.current = null;
  else frozen.current ??= current;
  const rows = frozen.current ?? current;
  const newWhilePaused = paused ? current.filter((t) => t.at > (rows[0]?.at ?? 0)).length : 0;

  const lastMinute = liveTrades.filter((t) => t.at > now - 60_000);
  const minuteVolume = lastMinute.reduce((sum, t) => sum + t.solAmount, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">📡 Live Feed</h1>
          <p className="text-sm text-muted">
            <span className="font-mono text-text">{lastMinute.length}</span> trades ·{" "}
            <span className="font-mono text-text">{formatSol(minuteVolume)} SOL</span> in the last minute
          </p>
        </div>
        <div role="tablist" className="-mx-4 flex gap-2 overflow-x-auto px-4">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                filter === f.id ? "bg-pump text-black" : "bg-panel text-muted hover:text-text"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="relative mt-4 overflow-hidden rounded-xl border border-line bg-panel"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {paused && (
          <div className="absolute inset-x-0 top-0 z-10 flex justify-center pt-2">
            <span className="rounded-full bg-panel-2 px-3 py-1 text-xs text-muted shadow-lg shadow-black/40">
              ⏸ Paused{newWhilePaused > 0 ? ` · ${newWhilePaused} new` : ""}
            </span>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="px-4 py-16 text-center text-muted">
            {filter === "mine" ? "You haven't traded yet." : "Waiting for trades…"}
          </p>
        ) : (
          <ul>
            {rows.map((t) => {
              const token = tokens[t.tokenId];
              const canBuy = token && token.endedAt === null && (token.status === "live" || token.status === "graduated");
              const whale = t.solAmount >= 5;
              const fresh = t.at > renderedAt;
              return (
                <li
                  key={t.id}
                  className={`grid grid-cols-[auto_1fr_auto] items-center gap-x-3 border-t border-line px-4 py-2 text-sm first:border-t-0 sm:grid-cols-[3rem_minmax(0,1fr)_4rem_6rem_minmax(0,9rem)_3.5rem] ${
                    fresh ? (t.side === "buy" ? "animate-flash-up" : "animate-flash-down") : ""
                  }`}
                >
                  <span className="hidden text-xs text-muted sm:block">{timeAgo(t.at, now)}</span>
                  <span className="min-w-0 sm:order-none">
                    <TraderName trade={t} me={me?.user.username} />
                  </span>
                  <span className={`font-bold ${t.side === "buy" ? "text-pump" : "text-rug"}`}>
                    {t.isDev && t.side === "sell" ? "RUG" : t.side.toUpperCase()}
                  </span>
                  <span className={`col-span-2 font-mono sm:col-span-1 sm:text-right ${whale ? "font-bold text-sky-300" : ""}`}>
                    {whale && "🐋 "}
                    {formatSol(t.solAmount)} SOL
                  </span>
                  <Link
                    href={`/token/${t.ticker}`}
                    className="flex min-w-0 items-center gap-2 hover:underline"
                    title={`${formatTokens(t.tokenAmount)} ${t.name}`}
                  >
                    <TokenAvatar src={t.imageUrl} alt="" size={24} />
                    <span className="truncate font-medium">${t.ticker}</span>
                  </Link>
                  <span className="text-right">
                    {canBuy ? (
                      <BuyButton tokenId={t.tokenId} ticker={t.ticker} className="px-2 py-0.5 text-xs" />
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

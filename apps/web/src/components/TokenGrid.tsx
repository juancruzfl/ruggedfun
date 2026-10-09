"use client";

import { isHouseToken, type MarketToken, type TokenSummary } from "@ruggedfun/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useMarket } from "@/lib/marketStore";
import { TokenCard } from "./TokenCard";

const TABS = [
  { id: "new", label: "🆕 New" },
  { id: "graduating", label: "🎓 About to graduate" },
  { id: "top", label: "👑 Top market cap" },
  { id: "players", label: "👤 Player launches" },
  { id: "rugged", label: "💀 Rugged" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const MAX_CARDS = 60;

function selectTab(
  tokens: Record<string, MarketToken>,
  graveyard: TokenSummary[],
  playerHistory: TokenSummary[],
  tab: Tab,
): (MarketToken | TokenSummary)[] {
  const all = Object.values(tokens);
  switch (tab) {
    case "new":
      return all.sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_CARDS);
    case "graduating":
      return all
        // $RUGGEDFUN never graduates, however far along its price puts it.
        .filter((t) => t.status === "live" && !isHouseToken(t))
        .sort((a, b) => b.bondingProgress - a.bondingProgress)
        .slice(0, MAX_CARDS);
    case "top":
      return all
        .filter((t) => t.status === "live" || t.status === "graduated")
        .sort((a, b) => b.marketCap - a.marketCap)
        .slice(0, MAX_CARDS);
    case "players": {
      // Live launches from the market, then ones that rugged here, then the stored history for the rest.
      const seen = new Set<string>();
      return [...all.filter((t) => t.byPlayer), ...graveyard.filter((t) => t.byPlayer), ...playerHistory]
        .filter((t) => !seen.has(t.id) && seen.add(t.id))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, MAX_CARDS);
    }
    case "rugged": {
      // Tokens still twitching after the rug come first, then the graveyard.
      const twitching = all.filter((t) => t.status === "rugged").sort((a, b) => b.createdAt - a.createdAt);
      const ids = new Set(twitching.map((t) => t.id));
      return [...twitching, ...graveyard.filter((t) => !ids.has(t.id))].slice(0, MAX_CARDS);
    }
  }
}

export function TokenGrid() {
  const [tab, setTab] = useState<Tab>("new");
  const loaded = useMarket((s) => s.loaded);
  // Player launches that stopped trading only exist in the database; refetched each time the tab opens.
  const [playerHistory, setPlayerHistory] = useState<TokenSummary[]>([]);
  const tokens = useMarket(useShallow((s) => selectTab(s.tokens, s.graveyard, playerHistory, tab)));

  useEffect(() => {
    if (tab !== "players") return;
    fetch("/api/tokens?tab=players")
      .then((res) => (res.ok ? (res.json() as Promise<TokenSummary[]>) : []))
      .then(setPlayerHistory)
      .catch(() => {});
  }, [tab]);

  // The graveyard's history lives in the database; live rugs are added as they happen.
  const [graveyardLoaded, setGraveyardLoaded] = useState(false);
  useEffect(() => {
    if (tab !== "rugged" || graveyardLoaded) return;
    fetch("/api/tokens?tab=rugged")
      .then((res) => (res.ok ? (res.json() as Promise<TokenSummary[]>) : []))
      .then((rugged) => {
        useMarket.getState().addToGraveyard(rugged);
        setGraveyardLoaded(true);
      })
      .catch(() => {});
  }, [tab, graveyardLoaded]);

  return (
    <section aria-label="Tokens">
      <div role="tablist" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
              tab !== t.id
                ? "border-line bg-panel text-muted hover:border-muted/40 hover:text-text focus-visible:outline-pump"
                : t.id === "rugged"
                  ? "border-rug bg-rug font-semibold text-rug-ink focus-visible:outline-rug"
                  : "border-pump bg-pump font-semibold text-pump-ink focus-visible:outline-pump"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {!loaded &&
          Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border border-line bg-panel" />
          ))}
        {tokens.map((token) => (
          <TokenCard key={token.id} token={token} />
        ))}
      </div>
      {loaded && tokens.length === 0 && (
        <p className="py-12 text-center text-muted">
          {tab === "rugged" ? (
            "No rugs yet. Give it a minute."
          ) : tab === "players" ? (
            <>
              No player has launched a token yet.{" "}
              <Link href="/launch" className="font-semibold text-pump hover:underline">
                Launch yours →
              </Link>
            </>
          ) : (
            "Nothing here yet."
          )}
        </p>
      )}
    </section>
  );
}

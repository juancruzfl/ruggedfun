"use client";

import type { MarketToken, TokenSummary } from "@ruggedfun/shared";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useMarket } from "@/lib/marketStore";
import { TokenCard } from "./TokenCard";

const TABS = [
  { id: "new", label: "🆕 New" },
  { id: "graduating", label: "🎓 About to graduate" },
  { id: "top", label: "👑 Top market cap" },
  { id: "rugged", label: "💀 Rugged" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const MAX_CARDS = 60;

function selectTab(tokens: Record<string, MarketToken>, graveyard: TokenSummary[], tab: Tab): (MarketToken | TokenSummary)[] {
  const all = Object.values(tokens);
  switch (tab) {
    case "new":
      return all.sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_CARDS);
    case "graduating":
      return all
        .filter((t) => t.status === "live")
        .sort((a, b) => b.bondingProgress - a.bondingProgress)
        .slice(0, MAX_CARDS);
    case "top":
      return all
        .filter((t) => t.status === "live" || t.status === "graduated")
        .sort((a, b) => b.marketCap - a.marketCap)
        .slice(0, MAX_CARDS);
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
  const tokens = useMarket(useShallow((s) => selectTab(s.tokens, s.graveyard, tab)));

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
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              tab === t.id ? "bg-pump text-black" : "bg-panel text-muted hover:text-text"
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
          {tab === "rugged" ? "No rugs yet. Give it a minute." : "Nothing here yet."}
        </p>
      )}
    </section>
  );
}

"use client";

import type { TokenSummary } from "@ruggedfun/shared";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatUsd } from "@/lib/format";
import { useMarket } from "@/lib/marketStore";
import { Change, StatusBadge, TokenAvatar } from "./TokenBits";

const DEBOUNCE_MS = 150;

/** Token search by name or ticker. "/" focuses it, arrows + Enter pick a result. */
export function SearchBar() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TokenSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  // Prefer live data for tokens that are still trading.
  const live = useMarket((s) => s.tokens);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/tokens/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((res) => (res.ok ? (res.json() as Promise<TokenSummary[]>) : []))
        .then((found) => {
          setResults(found);
          setHighlight(0);
        })
        .catch(() => {});
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function go(token: TokenSummary) {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    router.push(`/token/${token.ticker}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && results[highlight]) {
      e.preventDefault();
      go(results[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const showResults = open && query.trim().length > 0;

  return (
    <div className="relative w-full max-w-md">
      <div className="flex items-center rounded-lg border border-line bg-panel px-3 focus-within:border-pump/50">
        <span aria-hidden className="text-muted">
          🔍
        </span>
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showResults}
          aria-controls="search-results"
          aria-label="Search tokens"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder="Search tokens…"
          className="w-full bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted/60"
        />
        <kbd className="hidden rounded border border-line px-1.5 font-mono text-[10px] text-muted sm:block">/</kbd>
      </div>

      {showResults && (
        <ul
          id="search-results"
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl shadow-black/60"
        >
          {results.length === 0 && <li className="px-3 py-3 text-sm text-muted">No tokens match “{query.trim()}”</li>}
          {results.map((result, i) => {
            const token = live[result.id] ?? result;
            const change = live[result.id]?.change5m;
            return (
              <li
                key={token.id}
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(token)}
                onMouseEnter={() => setHighlight(i)}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${i === highlight ? "bg-panel-2" : ""}`}
              >
                <TokenAvatar src={token.imageUrl} alt="" size={32} dim={token.status === "rugged" || token.status === "dead"} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{token.name}</span>
                    <StatusBadge status={token.status} />
                  </div>
                  <div className="text-xs text-muted">${token.ticker}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm">{formatUsd(token.marketCap)}</div>
                  {change !== undefined && <Change value={change} className="text-xs" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

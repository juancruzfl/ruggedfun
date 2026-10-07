"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatPct, formatTokens } from "@/lib/format";
import { useMarket } from "@/lib/marketStore";
import { useSession } from "./SessionProvider";
import { TokenAvatar } from "./TokenBits";

const formatSol = (sol: number) => sol.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortAddress = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

/** Top-bar wallet button with a dropdown panel. */
export function WalletChip() {
  const { me } = useSession();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const live = useMarket((s) => s.tokens);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!me) return null;

  // Tokens that stopped trading keep their last stored price (≈ zero for rugs).
  const holdings = me.positions.map((p) => {
    const value = p.tokenAmount * (live[p.tokenId]?.price ?? p.lastPrice);
    return { ...p, value, pnl: p.costBasisSol > 0 ? value / p.costBasisSol - 1 : 0 };
  });
  const netWorth = me.wallet.solBalance + holdings.reduce((sum, h) => sum + h.value, 0);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(me!.wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked; nothing useful to do.
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-line bg-panel px-3 py-1.5 text-sm transition hover:border-pump/50"
      >
        <span className="font-mono font-semibold text-pump">{formatSol(me.wallet.solBalance)} SOL</span>
        <span className="hidden text-muted xl:inline">@{me.user.username}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Wallet"
          className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-line bg-panel p-4 shadow-2xl shadow-black/60"
        >
          <div className="text-sm font-semibold">@{me.user.username}</div>
          <button
            onClick={copyAddress}
            className="mt-1 font-mono text-xs text-muted transition hover:text-text"
            title={me.wallet.address}
          >
            {shortAddress(me.wallet.address)} {copied ? "✓ copied" : "⧉"}
          </button>

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-bg p-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted">Balance</div>
              <div className="mt-0.5 font-mono text-xl font-bold text-pump">{formatSol(me.wallet.solBalance)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted">Net worth</div>
              <div className="mt-0.5 font-mono text-xl font-bold">{formatSol(netWorth)}</div>
            </div>
          </div>

          <div className="mt-4 text-xs uppercase tracking-wide text-muted">Positions</div>
          {holdings.length === 0 ? (
            <p className="mt-1 text-sm text-muted">None yet. Go find something to ape into.</p>
          ) : (
            <ul className="mt-1 max-h-64 space-y-1 overflow-y-auto">
              {holdings.map((h) => (
                <li key={h.tokenId}>
                  <Link
                    href={`/token/${h.ticker}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-panel-2"
                  >
                    <TokenAvatar src={h.imageUrl} alt="" size={28} dim={!live[h.tokenId]} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">${h.ticker}</div>
                      <div className="text-xs text-muted">{formatTokens(h.tokenAmount)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm">{formatSol(h.value)} SOL</div>
                      <div className={`font-mono text-xs ${h.pnl >= 0 ? "text-pump" : "text-rug"}`}>{formatPct(h.pnl)}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

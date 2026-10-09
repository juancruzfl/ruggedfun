"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { formatSol, formatTokens, formatUsd } from "@/lib/format";
import type { PlayerStats } from "@/lib/playerStats";

/** Matches the server's cache, so a refresh can bring new numbers. */
const REFRESH_MS = 30_000;

/** Volumes in the thousands get the short form ("5.8K") so they fit a quarter of the card. */
const compactSol = (sol: number) => (sol >= 1000 ? formatTokens(sol) : formatSol(sol));

const Muted = ({ children }: { children: ReactNode }) => <span className="text-xs font-normal text-muted">{children}</span>;

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-sm font-semibold">{children}</dd>
    </div>
  );
}

/**
 * What real players have been up to, beside the $RUGGEDFUN card and built like it: their trading
 * volume, activity, launch count and the best win of the day. Bots are left out. (Player launches
 * themselves are listed in the token grid's tab.)
 */
export function PlayerStatsCard({ initial }: { initial: PlayerStats }) {
  const [stats, setStats] = useState(initial);

  useEffect(() => {
    const timer = setInterval(() => {
      fetch("/api/players")
        .then((res) => (res.ok ? (res.json() as Promise<PlayerStats>) : null))
        .then((next) => next && setStats(next))
        .catch(() => {});
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const win = stats.biggestWin24h;

  return (
    <section
      aria-labelledby="players-title"
      // Same frame as the $RUGGEDFUN card, and a size container so it lays out by its own width.
      className="@container rounded-2xl bg-linear-to-r from-pump/60 via-line to-rug/60 p-px shadow-lg shadow-pump/5"
    >
      <div className="flex h-full flex-col gap-5 rounded-[calc(1rem-1px)] bg-panel bg-linear-to-br from-pump/[0.08] via-panel to-rug/[0.06] p-4 @lg:p-5">
        <div>
          <div className="flex items-center gap-4">
            <span aria-hidden className="flex size-[72px] shrink-0 items-center justify-center rounded-lg bg-panel-2 text-4xl">
              👥
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="players-title" className="text-2xl font-bold tracking-tight">
                  Players
                </h2>
                <span className="rounded bg-sky-400/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-sky-300">
                  REAL PLAYERS
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">What real players have been up to. Bots aren&apos;t counted.</p>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 @lg:grid-cols-4">
            <div className="col-span-2 @lg:col-span-1" title={`${formatSol(stats.volumeSol)} SOL (≈ ${formatUsd(stats.volumeSol)}) all time`}>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">Player volume</dt>
              <dd className="mt-0.5 truncate font-mono text-2xl font-bold">
                {compactSol(stats.volumeSol)} <Muted>SOL</Muted>
              </dd>
            </div>
            <Stat label="24h volume">
              {compactSol(stats.volume24hSol)} <Muted>SOL</Muted>
            </Stat>
            <Stat label="Active today">
              {stats.activePlayers24h.toLocaleString("en-US")} <Muted>of {stats.players.toLocaleString("en-US")}</Muted>
            </Stat>
            <Stat label="Launches">
              {stats.launches.toLocaleString("en-US")} <Muted>+{stats.launches24h} today</Muted>
            </Stat>
          </dl>
        </div>

        {/* Pinned to the bottom, like the $RUGGEDFUN card's chart and buttons, so the two cards line up. */}
        <div className="mt-auto flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-lg border border-line bg-panel-2/60 px-3 py-2.5">
            <span aria-hidden className="text-2xl">
              🏆
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Biggest win today</div>
              {win ? (
                <div className="truncate text-sm">
                  <span className="font-mono font-bold text-pump">+{formatSol(win.pnlSol)} SOL</span>{" "}
                  <span className="text-muted">
                    · {win.username} on ${win.ticker} ({win.multiple.toFixed(1)}x)
                  </span>
                </div>
              ) : (
                <div className="text-sm text-muted">No winning sells yet today.</div>
              )}
            </div>
            <span className="hidden shrink-0 font-mono text-xs text-muted @md:inline">
              {stats.trades24h.toLocaleString("en-US")} {stats.trades24h === 1 ? "trade" : "trades"} today
            </span>
          </div>
          <div className="flex gap-2">
            <Link
              href="/launch"
              className="flex-1 rounded-md bg-pump py-2.5 text-center text-sm font-bold text-pump-ink transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pump"
            >
              Launch a token
            </Link>
            <Link
              href="/leaderboard"
              className="flex-1 rounded-md border border-line bg-panel-2 py-2.5 text-center text-sm font-semibold transition hover:border-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pump"
            >
              Leaderboard
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

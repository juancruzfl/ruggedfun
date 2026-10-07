import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AutoRefresh } from "@/components/AutoRefresh";
import { formatPct, formatSol, timeAgo } from "@/lib/format";
import {
  getLeaderboard,
  LEADERBOARD_TABS,
  type LeaderboardRows,
  type LeaderboardTab,
  type PnlRow,
  type ShameRow,
  type WinRow,
} from "@/lib/leaderboard";
import { getMe } from "@/lib/session";

const TOP = 100;

export const metadata: Metadata = { title: "Leaderboard" };

const TAB_INFO: Record<LeaderboardTab, { label: string; blurb: string; empty: string }> = {
  all: { label: "All-time PnL", blurb: "Net worth vs. the 10 SOL everyone starts with.", empty: "No one has traded yet." },
  "24h": { label: "24h PnL", blurb: "Net worth change over the last 24 hours.", empty: "No trades in the last 24 hours." },
  wins: { label: "Biggest win", blurb: "The single most profitable sell.", empty: "No one has sold for a profit yet." },
  shame: { label: "💀 Wall of shame", blurb: "SOL that was sitting in a token when it rugged.", empty: "No one has been rugged. Yet." },
};

const MEDALS = ["🥇", "🥈", "🥉"];

const signedSol = (sol: number) => `${sol > 0 ? "+" : ""}${formatSol(sol)} SOL`;
const pnlColor = (sol: number) => (sol > 0 ? "text-pump" : sol < 0 ? "text-rug" : "text-muted");

type AnyRow = PnlRow | WinRow | ShameRow;

/** The headline number for a row, as shown on the podium. */
function headline(data: LeaderboardRows, row: AnyRow): { value: ReactNode; sub: ReactNode } {
  if (data.tab === "wins") {
    const r = row as WinRow;
    return { value: <span className="text-pump">{signedSol(r.pnlSol)}</span>, sub: `${r.multiple.toFixed(1)}x on $${r.ticker}` };
  }
  if (data.tab === "shame") {
    const r = row as ShameRow;
    return { value: <span className="text-rug">−{formatSol(r.lostSol)} SOL</span>, sub: `rugged ${r.rugs}× · worst $${r.worstTicker}` };
  }
  const r = row as PnlRow;
  return {
    value: <span className={pnlColor(r.pnlSol)}>{signedSol(r.pnlSol)}</span>,
    sub: `${formatPct(r.pnlPct)} · net worth ${formatSol(r.netWorthSol)} SOL`,
  };
}

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: requested } = await searchParams;
  const tab = (LEADERBOARD_TABS as readonly string[]).includes(requested ?? "") ? (requested as LeaderboardTab) : "all";
  const [data, me] = await Promise.all([getLeaderboard(tab), getMe()]);
  const now = Date.now();

  const top = data.rows.slice(0, TOP) as AnyRow[];
  const podium = top.slice(0, 3);
  const rest = top.slice(3);
  const mine = me ? (data.rows as AnyRow[]).find((r) => r.userId === me.user.id) : undefined;
  const pinMine = mine && mine.rank > TOP;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <AutoRefresh seconds={30} />
      <h1 className="text-2xl font-bold">🏆 Leaderboard</h1>
      <p className="text-sm text-muted">
        {TAB_INFO[tab].blurb} {data.rows.length} player{data.rows.length === 1 ? "" : "s"} · updates every 30 seconds.
      </p>

      <nav aria-label="Leaderboard" className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
        {LEADERBOARD_TABS.map((t) => (
          <Link
            key={t}
            href={t === "all" ? "/leaderboard" : `/leaderboard?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              t === tab ? (t === "shame" ? "bg-rug text-black" : "bg-pump text-black") : "bg-panel text-muted hover:text-text"
            }`}
          >
            {TAB_INFO[t].label}
          </Link>
        ))}
      </nav>

      {data.rows.length === 0 ? (
        <p className="mt-10 rounded-xl border border-dashed border-line p-12 text-center text-muted">{TAB_INFO[tab].empty}</p>
      ) : (
        <>
          <ol className="mt-6 grid gap-3 sm:grid-cols-3">
            {podium.map((row, i) => {
              const { value, sub } = headline(data, row);
              const isMe = row.userId === me?.user.id;
              return (
                <li
                  key={row.userId}
                  className={`rounded-xl border bg-panel p-4 ${isMe ? "border-pump/60" : "border-line"} ${i === 0 ? "sm:order-2 sm:-mt-2 sm:pb-6" : i === 1 ? "sm:order-1" : "sm:order-3"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl" aria-label={`Rank ${row.rank}`}>
                      {tab === "shame" ? "💀" : MEDALS[i]}
                    </span>
                    <span className="truncate font-semibold">{row.username}</span>
                    {isMe && <span className="rounded bg-pump/15 px-1 text-[10px] font-bold text-pump">YOU</span>}
                  </div>
                  <div className="mt-2 font-mono text-xl font-bold">{value}</div>
                  <div className="mt-0.5 truncate text-xs text-muted">{sub}</div>
                </li>
              );
            })}
          </ol>

          {(rest.length > 0 || pinMine) && (
            <div className="mt-6 overflow-x-auto rounded-xl border border-line bg-panel">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <Header tab={data.tab} />
                </thead>
                <tbody>
                  {rest.map((row) => (
                    <Row key={row.userId} data={data} row={row} isMe={row.userId === me?.user.id} now={now} />
                  ))}
                  {pinMine && (
                    <>
                      <tr aria-hidden>
                        <td colSpan={6} className="border-t border-line py-1 text-center text-muted">
                          ⋮
                        </td>
                      </tr>
                      <Row data={data} row={mine} isMe now={now} />
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {me && !mine && data.rows.length > 0 && (
        <p className="mt-4 text-center text-sm text-muted">
          {tab === "shame" ? "You haven't been rugged. Yet." : "Make a trade to get on the board."}
        </p>
      )}
    </div>
  );
}

function Header({ tab }: { tab: LeaderboardRows["tab"] }) {
  const cell = "px-4 py-2 font-medium";
  if (tab === "wins") {
    return (
      <tr>
        <th className={cell}>#</th>
        <th className={cell}>Player</th>
        <th className={`${cell} text-right`}>Profit</th>
        <th className={`${cell} text-right`}>Multiple</th>
        <th className={cell}>Token</th>
        <th className={`${cell} hidden text-right sm:table-cell`}>When</th>
      </tr>
    );
  }
  if (tab === "shame") {
    return (
      <tr>
        <th className={cell}>#</th>
        <th className={cell}>Player</th>
        <th className={`${cell} text-right`}>SOL lost</th>
        <th className={`${cell} text-right`}>Rugs</th>
        <th className={`${cell} hidden sm:table-cell`}>Worst rug</th>
      </tr>
    );
  }
  return (
    <tr>
      <th className={cell}>#</th>
      <th className={cell}>Player</th>
      <th className={`${cell} text-right`}>PnL</th>
      <th className={`${cell} hidden text-right sm:table-cell`}>Net worth</th>
      <th className={`${cell} hidden text-right md:table-cell`}>Win rate</th>
      <th className={`${cell} hidden text-right md:table-cell`}>Trades</th>
    </tr>
  );
}

function Row({ data, row, isMe, now }: { data: LeaderboardRows; row: AnyRow; isMe: boolean; now: number }) {
  const cell = "px-4 py-2";
  const player = (
    <td className={`${cell} max-w-48`}>
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span className={`truncate ${isMe ? "font-semibold text-pump" : ""}`}>{row.username}</span>
        {isMe && <span className="shrink-0 rounded bg-pump/15 px-1 text-[10px] font-bold text-pump">YOU</span>}
      </span>
    </td>
  );
  const rank = <td className={`${cell} font-mono text-muted`}>{row.rank}</td>;
  const rowClass = `border-t border-line ${isMe ? "bg-pump/5" : ""}`;

  if (data.tab === "wins") {
    const r = row as WinRow;
    return (
      <tr className={rowClass}>
        {rank}
        {player}
        <td className={`${cell} text-right font-mono text-pump`}>{signedSol(r.pnlSol)}</td>
        <td className={`${cell} text-right font-mono`}>{r.multiple.toFixed(1)}x</td>
        <td className={cell}>
          <Link href={`/token/${r.ticker}`} className="hover:underline">
            ${r.ticker}
          </Link>
        </td>
        <td className={`${cell} hidden text-right text-muted sm:table-cell`}>{timeAgo(r.at, now)} ago</td>
      </tr>
    );
  }
  if (data.tab === "shame") {
    const r = row as ShameRow;
    return (
      <tr className={rowClass}>
        {rank}
        {player}
        <td className={`${cell} text-right font-mono text-rug`}>−{formatSol(r.lostSol)} SOL</td>
        <td className={`${cell} text-right font-mono`}>{r.rugs}</td>
        <td className={`${cell} hidden sm:table-cell`}>
          <Link href={`/token/${r.worstTicker}`} className="hover:underline">
            ${r.worstTicker}
          </Link>
        </td>
      </tr>
    );
  }
  const r = row as PnlRow;
  return (
    <tr className={rowClass}>
      {rank}
      {player}
      <td className={`${cell} text-right font-mono ${pnlColor(r.pnlSol)}`}>
        {signedSol(r.pnlSol)} <span className="text-xs">({formatPct(r.pnlPct)})</span>
      </td>
      <td className={`${cell} hidden text-right font-mono sm:table-cell`}>{formatSol(r.netWorthSol)} SOL</td>
      <td className={`${cell} hidden text-right font-mono md:table-cell`}>
        {r.winRate === null ? "—" : `${Math.round(r.winRate * 100)}%`}
      </td>
      <td className={`${cell} hidden text-right font-mono md:table-cell`}>{r.trades}</td>
    </tr>
  );
}

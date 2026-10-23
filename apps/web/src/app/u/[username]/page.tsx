import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ShareButtons } from "@/components/ShareButtons";
import { formatPct, formatSol, timeAgo } from "@/lib/format";
import { getProfile } from "@/lib/profile";
import { getMe } from "@/lib/session";

const signed = (sol: number) => `${sol >= 0 ? "+" : "−"}${formatSol(Math.abs(sol))}`;
const tone = (n: number) => (n > 0 ? "text-pump" : n < 0 ? "text-rug" : "text-muted");

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfile(decodeURIComponent(username));
  if (!profile) return { title: "Player not found" };
  // The shared image comes from ./opengraph-image; X shows it large with summary_large_image.
  return {
    title: `@${profile.username}`,
    description: `${signed(profile.pnlSol)} SOL all-time PnL on ruggedfun, the play-money memecoin launchpad.`,
    twitter: { card: "summary_large_image" },
  };
}

function Stat({ label, sub, children }: { label: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-sm font-semibold">{children}</dd>
      {sub && <dd className="truncate text-xs text-muted">{sub}</dd>}
    </div>
  );
}

/** A player's public profile: their PnL and track record, and their shareable PnL card. */
export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const [profile, me] = await Promise.all([getProfile(decodeURIComponent(username)), getMe()]);
  if (!profile) notFound();

  const mine = me?.user.id === profile.userId;
  const path = `/u/${profile.username}`;
  const verb = profile.pnlSol >= 0 ? "up" : "down";
  const shareText = mine
    ? `I'm ${verb} ${formatSol(Math.abs(profile.pnlSol))} SOL on ruggedfun (all play money).`
    : `@${profile.username} is ${verb} ${formatSol(Math.abs(profile.pnlSol))} SOL on ruggedfun (all play money).`;

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      {/* Built like the home page's $RUGGEDFUN and Players cards. */}
      <section
        aria-labelledby="profile-title"
        className="rounded-2xl bg-linear-to-r from-pump/60 via-line to-rug/60 p-px shadow-lg shadow-pump/5"
      >
        <div className="rounded-[calc(1rem-1px)] bg-panel bg-linear-to-br from-pump/[0.08] via-panel to-rug/[0.06] p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-4">
            <span
              aria-hidden
              className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-panel-2 text-3xl font-bold text-pump"
            >
              {profile.username.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 id="profile-title" className="truncate text-2xl font-bold tracking-tight">
                  @{profile.username}
                </h1>
                {mine && <span className="rounded bg-pump/15 px-1.5 py-0.5 text-[10px] font-bold text-pump">YOU</span>}
                {profile.rank && (
                  <Link
                    href="/leaderboard"
                    className="rounded bg-sky-400/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-sky-300 hover:underline"
                  >
                    #{profile.rank.place} OF {profile.rank.of}
                  </Link>
                )}
              </div>
              <p className="mt-1 text-sm text-muted">Joined {timeAgo(profile.joinedAt)} ago</p>
            </div>
            {/* Its own line on phones, so the username keeps its room; beside it from sm up. */}
            <div className="basis-full sm:basis-auto sm:text-right">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">All-time PnL</div>
              <div className={`font-mono text-3xl font-bold ${tone(profile.pnlSol)}`}>{signed(profile.pnlSol)} SOL</div>
              <div className={`font-mono text-sm ${tone(profile.pnlSol)}`}>{formatPct(profile.pnlPct)}</div>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-4">
            <Stat label="24h PnL" sub={formatPct(profile.pnl24hPct)}>
              <span className={tone(profile.pnl24hSol)}>{signed(profile.pnl24hSol)} SOL</span>
            </Stat>
            <Stat label="Net worth">{formatSol(profile.netWorthSol)} SOL</Stat>
            <Stat label="Trades" sub={profile.winRate === null ? "no sells yet" : `${Math.round(profile.winRate * 100)}% winning sells`}>
              {profile.trades.toLocaleString("en-US")}
            </Stat>
            <Stat label="Best win" sub={profile.bestWin ? `on $${profile.bestWin.ticker}` : undefined}>
              {profile.bestWin ? (
                <span className="text-pump">
                  +{formatSol(profile.bestWin.pnlSol)} SOL ({profile.bestWin.multiple.toFixed(1)}x)
                </span>
              ) : (
                "—"
              )}
            </Stat>
            <Stat label="Rugged">{profile.rugs.toLocaleString("en-US")} times</Stat>
            <Stat label="Launches">{profile.launches.toLocaleString("en-US")}</Stat>
          </dl>
        </div>
      </section>

      <section aria-labelledby="share-title" className="rounded-xl border border-line bg-panel p-4 sm:p-5">
        <h2 id="share-title" className="font-semibold">
          {mine ? "Share your PnL" : `Share @${profile.username}'s PnL`}
        </h2>
        <p className="mt-0.5 text-sm text-muted">
          The card updates live. Posting the link shows it as the preview on X, Discord and most chat apps.
        </p>
        {/* The same image link previews use, so what you see here is what people get. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${path}/opengraph-image`}
          alt={`PnL card for @${profile.username}: ${signed(profile.pnlSol)} SOL all time`}
          width={1200}
          height={630}
          className="mt-4 aspect-[1200/630] w-full rounded-xl border border-line bg-bg"
        />
        <div className="mt-4">
          <ShareButtons
            path={path}
            text={shareText}
            imagePath={`${path}/opengraph-image`}
            filename={`ruggedfun-${profile.username}-pnl.png`}
          />
        </div>
      </section>
    </div>
  );
}

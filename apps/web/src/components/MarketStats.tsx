"use client";

import { isHouseToken, type TokenSummary } from "@ruggedfun/shared";
import { CURVE, GRADUATION_PRICE, marketCapSol } from "@ruggedfun/sim";
import { formatTokens, formatUsd } from "@/lib/format";

const GRADUATION_MCAP = marketCapSol(GRADUATION_PRICE);

/** $RUGGEDFUN's curve has no finish line, so there's no progress bar to show. */
function HouseCurveCard() {
  return (
    <section aria-labelledby="curve-title" className="rounded-xl border border-pump/25 bg-panel p-4">
      <h2 id="curve-title" className="font-semibold">
        No finish line
      </h2>
      <p className="mt-2 text-sm text-muted">
        $RUGGEDFUN is ruggedfun&apos;s own token. Its bonding curve never completes, so it never graduates, and it
        can&apos;t rug or die. Buy and sell any time.
      </p>
    </section>
  );
}

/** pump.fun-style curve card: progress to graduation and what's left, or how it ended. */
export function BondingCurveCard({ token }: { token: TokenSummary }) {
  if (isHouseToken(token)) return <HouseCurveCard />;

  // A graduated curve stays complete even if the price dips afterwards.
  const progress = token.status === "graduated" ? 1 : token.bondingProgress;
  const pct = Math.round(progress * 100);

  const state =
    token.status === "rugged"
      ? {
          title: "💀 Rugged",
          tone: "bg-rug/60",
          text: "The dev pulled the liquidity. This curve isn't going anywhere.",
        }
      : token.status === "dead"
        ? { title: "Trading stopped", tone: "bg-line", text: "Everyone left. This token is no longer trading." }
        : token.status === "graduated" || progress >= 1
          ? {
              title: "🎓 Graduated",
              tone: "bg-amber-300",
              text: "The curve is complete. Trading continues, but it can't graduate twice.",
            }
          : null;

  return (
    <section aria-labelledby="curve-title" className="rounded-xl border border-line bg-panel p-4">
      <div className="flex items-baseline justify-between">
        <h2 id="curve-title" className="font-semibold">
          {state?.title ?? "Bonding curve"}
        </h2>
        <span className="font-mono text-lg font-bold">{pct}%</span>
      </div>
      <div
        className="mt-2 h-3 overflow-hidden rounded-full bg-panel-2"
        role="progressbar"
        aria-label="Bonding curve progress"
        aria-valuenow={pct}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-700 ${
            state?.tone ?? "bg-linear-to-r from-pump/60 to-pump shadow-[0_0_12px] shadow-pump/40"
          }`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {state ? (
        <p className="mt-3 text-sm text-muted">{state.text}</p>
      ) : (
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-muted">To graduate</dt>
            <dd className="font-mono">
              {formatUsd(Math.max(0, GRADUATION_MCAP - token.marketCap))} <span className="text-muted">more</span>
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Graduates at</dt>
            <dd className="font-mono">{formatUsd(GRADUATION_MCAP)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Left on curve</dt>
            <dd className="font-mono">{formatTokens(CURVE.curveTokens * (1 - progress))} tokens</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

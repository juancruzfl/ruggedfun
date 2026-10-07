"use client";

import confetti from "canvas-confetti";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatPct, formatSol } from "@/lib/format";
import { useMarket } from "@/lib/marketStore";
import { positionValue } from "@/lib/positionValue";
import { useMoments, type Moment } from "@/lib/moments";
import { useQuickTrade } from "@/lib/quickTrade";
import { useSession } from "./SessionProvider";
import { TokenAvatar } from "./TokenBits";

const RAIN = { rug: ["💀", "📉", "🩸", "🪦"], moon: ["🚀", "💰", "💎", "🌕"] } as const;
const DROPS = 28;
const SHAKE_MS = 700;

/**
 * Watches the market for rugs on tokens the player holds. The engine announces the rug before
 * that second's price update, so the moment waits for the crashed price (or 2s) before showing.
 */
function useRugWatcher() {
  const { me } = useSession();
  const show = useMoments((s) => s.show);
  const positions = useRef(me?.positions ?? []);
  positions.current = me?.positions ?? [];

  useEffect(() => {
    const pending = new Map<string, ReturnType<typeof setTimeout>>();

    const reveal = (tokenId: string) => {
      clearTimeout(pending.get(tokenId));
      pending.delete(tokenId);
      const p = positions.current.find((pos) => pos.tokenId === tokenId);
      const token = useMarket.getState().tokens[tokenId];
      if (!p || !token) return;
      const value = positionValue(p.tokenAmount, token, p.lastPrice);
      show({
        kind: "rug",
        tokenId,
        ticker: token.ticker,
        name: token.name,
        imageUrl: token.imageUrl,
        lostSol: Math.max(0, p.costBasisSol - value),
        lostPct: p.costBasisSol > 0 ? value / p.costBasisSol - 1 : -1,
      });
    };

    const unsubscribe = useMarket.subscribe((state, prev) => {
      for (const p of positions.current) {
        const now = state.tokens[p.tokenId];
        const before = prev.tokens[p.tokenId];
        if (!now || !before) continue;
        if (pending.has(p.tokenId) && now.price !== before.price) reveal(p.tokenId);
        else if (now.status === "rugged" && before.status !== "rugged") {
          pending.set(
            p.tokenId,
            setTimeout(() => reveal(p.tokenId), 2000),
          );
        }
      }
    });
    return () => {
      unsubscribe();
      pending.forEach(clearTimeout);
    };
  }, [show]);
}

const CONFETTI_COLORS = ["#4ade80", "#fcd34d", "#ffffff", "#38bdf8"];

/** Confetti cannons from both bottom corners, then a burst from the middle. Above the overlay (z-50). */
function celebrate() {
  const base = { colors: CONFETTI_COLORS, zIndex: 60, disableForReducedMotion: true, ticks: 220 };
  void confetti({ ...base, particleCount: 80, angle: 60, spread: 60, startVelocity: 60, origin: { x: 0, y: 0.9 } });
  void confetti({ ...base, particleCount: 80, angle: 120, spread: 60, startVelocity: 60, origin: { x: 1, y: 0.9 } });
  setTimeout(
    () => void confetti({ ...base, particleCount: 120, spread: 100, startVelocity: 45, origin: { y: 0.45 } }),
    250,
  );
}

function shareText(m: Moment): string {
  return m.kind === "rug"
    ? `I just got rugged on $${m.ticker} for ${formatSol(m.lostSol)} SOL 💀 ruggedfun.xyz`
    : `I just ${m.multiple.toFixed(1)}x'd $${m.ticker} for +${formatSol(m.profitSol)} SOL 🚀 ruggedfun.xyz`;
}

/** Full-screen rug / moon moment: emoji rain, screen shake, sound (played by the store). */
export function MomentOverlay() {
  useRugWatcher();
  const { current, dismiss } = useMoments();
  const openTrade = useQuickTrade((s) => s.open);
  const stillTrading = useMarket((s) => (current ? s.tokens[current.tokenId]?.endedAt === null : false));
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const drops = useMemo(
    () =>
      current
        ? Array.from({ length: DROPS }, (_, i) => ({
            emoji: RAIN[current.kind][i % RAIN[current.kind].length],
            left: Math.random() * 100,
            delay: Math.random() * 1.2,
            duration: 2.2 + Math.random() * 2,
            size: 1.2 + Math.random() * 1.6,
          }))
        : [],
    [current],
  );

  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    if (!current) return;
    setCopied(false);
    closeRef.current?.focus();
    // Shake the overlay itself, never the page: a transform on <html> re-anchors every fixed
    // element (this overlay included) to the top of the document, so a scrolled-down player
    // would see the popup jump off-screen.
    setShaking(true);
    const timer = setTimeout(() => setShaking(false), SHAKE_MS);
    if (current.kind === "moon") celebrate();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismiss();
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
    };
  }, [current, dismiss]);

  if (!current) return null;
  const rug = current.kind === "rug";

  async function share() {
    const text = shareText(current!);
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }
    } catch {
      // Share sheet dismissed or clipboard blocked.
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center overflow-hidden px-4 backdrop-blur-sm ${
        shaking ? "animate-screen-shake" : ""
      } ${
        rug
          ? "bg-[radial-gradient(circle,rgba(244,63,94,0.35),rgba(0,0,0,0.92))]"
          : "bg-[radial-gradient(circle,rgba(74,222,128,0.3),rgba(0,0,0,0.9))]"
      }`}
      onMouseDown={(e) => e.target === e.currentTarget && dismiss()}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 motion-reduce:hidden">
        {drops.map((d, i) => (
          <span
            key={i}
            className="absolute -top-12 animate-emoji-fall"
            style={{
              left: `${d.left}%`,
              animationDelay: `${d.delay}s`,
              animationDuration: `${d.duration}s`,
              fontSize: `${d.size}rem`,
            }}
          >
            {d.emoji}
          </span>
        ))}
      </div>

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="moment-title"
        aria-describedby="moment-detail"
        className={`relative w-full max-w-sm rounded-2xl border bg-panel p-6 text-center shadow-2xl ${
          rug ? "border-rug/60 shadow-rug/20" : "border-pump/60 shadow-pump/20"
        }`}
      >
        <div className="flex justify-center">
          <TokenAvatar src={current.imageUrl} alt="" size={72} dim={rug} />
        </div>
        <h2
          id="moment-title"
          className={`mt-4 text-4xl font-black tracking-tight ${rug ? "animate-pulse text-rug" : "text-pump"}`}
        >
          {rug ? "💀 RUGGED" : `🚀 ${current.multiple.toFixed(1)}x`}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {rug ? (
            <>${current.ticker} just got rugged by its dev.</>
          ) : (
            <>
              You {current.multiple.toFixed(1)}x&apos;d ${current.ticker}.
            </>
          )}
        </p>
        <p id="moment-detail" className={`mt-4 font-mono text-2xl font-bold ${rug ? "text-rug" : "text-pump"}`}>
          {rug ? `−${formatSol(current.lostSol)} SOL` : `+${formatSol(current.profitSol)} SOL`}
          {rug && <span className="text-base"> ({formatPct(current.lostPct)})</span>}
        </p>

        <div className="mt-6 grid gap-2">
          {rug && stillTrading && (
            <button
              onClick={() => {
                dismiss();
                openTrade(current.tokenId, "sell");
              }}
              className="rounded-lg bg-rug py-2.5 font-bold text-black transition hover:brightness-110"
            >
              Sell what&apos;s left
            </button>
          )}
          <button onClick={share} className="rounded-lg bg-panel-2 py-2.5 font-semibold transition hover:bg-line">
            {copied ? "✓ Copied" : rug ? "Share my L" : "Share the W"}
          </button>
          <button ref={closeRef} onClick={dismiss} className="py-1.5 text-sm text-muted hover:text-text">
            {rug ? "I'm fine 🙂" : "Keep going"}
          </button>
        </div>
      </div>
    </div>
  );
}

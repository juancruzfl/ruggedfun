"use client";

import { useQuickTrade } from "@/lib/quickTrade";

/** Opens the quick-trade modal on the buy side. Sits above a card's full-size link, so it needs its own stacking. */
export function BuyButton({ tokenId, ticker, className = "" }: { tokenId: string; ticker: string; className?: string }) {
  const open = useQuickTrade((s) => s.open);
  return (
    <button
      type="button"
      onClick={() => open(tokenId)}
      aria-label={`Buy $${ticker}`}
      className={`pointer-events-auto relative z-10 rounded-md bg-pump font-bold text-pump-ink transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pump ${className}`}
    >
      Buy
    </button>
  );
}

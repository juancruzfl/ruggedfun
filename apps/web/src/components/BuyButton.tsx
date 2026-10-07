"use client";

import { useQuickBuy } from "@/lib/quickBuy";

/** Opens the quick-buy modal. Sits above a card's full-size link, so it needs its own stacking. */
export function BuyButton({ tokenId, ticker, className = "" }: { tokenId: string; ticker: string; className?: string }) {
  const open = useQuickBuy((s) => s.open);
  return (
    <button
      type="button"
      onClick={() => open(tokenId)}
      aria-label={`Buy $${ticker}`}
      className={`pointer-events-auto relative z-10 rounded-md bg-pump font-bold text-black transition hover:brightness-110 ${className}`}
    >
      Buy
    </button>
  );
}

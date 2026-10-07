"use client";

import type { TradeSide } from "@ruggedfun/shared";
import { create } from "zustand";

/** Which token (and side) the quick-trade modal is open for, if any. */
export const useQuickTrade = create<{
  tokenId: string | null;
  side: TradeSide;
  open(tokenId: string, side?: TradeSide): void;
  close(): void;
}>((set) => ({
  tokenId: null,
  side: "buy",
  open: (tokenId, side = "buy") => set({ tokenId, side }),
  close: () => set({ tokenId: null }),
}));

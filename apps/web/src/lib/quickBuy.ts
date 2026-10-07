"use client";

import { create } from "zustand";

/** Which token the quick-buy modal is open for, if any. */
export const useQuickBuy = create<{ tokenId: string | null; open(id: string): void; close(): void }>((set) => ({
  tokenId: null,
  open: (tokenId) => set({ tokenId }),
  close: () => set({ tokenId: null }),
}));

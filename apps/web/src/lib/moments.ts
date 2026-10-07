"use client";

import { create } from "zustand";
import { sounds } from "./sound";

interface TokenRef {
  tokenId: string;
  ticker: string;
  name: string;
  imageUrl: string;
}

export type Moment =
  | (TokenRef & { kind: "rug"; lostSol: number; lostPct: number })
  | (TokenRef & { kind: "moon"; multiple: number; profitSol: number });

/** The full-screen rug / moon moment currently showing, if any. */
export const useMoments = create<{ current: Moment | null; show(moment: Moment): void; dismiss(): void }>((set) => ({
  current: null,
  show: (moment) => {
    set({ current: moment });
    if (moment.kind === "rug") sounds.rug();
    else sounds.moon();
  },
  dismiss: () => set({ current: null }),
}));

/** A sell counts as a moon moment at 2x or better, or 2+ SOL profit. */
export function isMoonSell(proceedsSol: number, realizedPnlSol: number | null): { multiple: number; profitSol: number } | null {
  if (realizedPnlSol === null || realizedPnlSol <= 0) return null;
  const multiple = proceedsSol / (proceedsSol - realizedPnlSol);
  return multiple >= 2 || realizedPnlSol >= 2 ? { multiple, profitSol: realizedPnlSol } : null;
}

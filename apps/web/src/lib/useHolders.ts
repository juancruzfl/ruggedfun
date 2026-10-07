"use client";

import { useEffect, useState } from "react";
import type { Holder } from "./tokens";

export type HolderData = { holders: Holder[]; count: number; mine: Holder | null };

const HOLDERS_REFRESH_MS = 10_000;

/** A token's holders and holder count, refreshed every 10s. One fetch shared by the stats strip and the Holders tab. */
export function useHolders(tokenId: string): HolderData | null {
  const [data, setData] = useState<HolderData | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/tokens/${tokenId}/holders`)
        .then((res) => (res.ok ? res.json() : null))
        .then((d) => !cancelled && d && setData(d))
        .catch(() => {});
    void load();
    const timer = setInterval(load, HOLDERS_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [tokenId]);

  return data;
}

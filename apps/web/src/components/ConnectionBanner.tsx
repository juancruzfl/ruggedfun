"use client";

import { useEffect, useState } from "react";
import { useMarket } from "@/lib/marketStore";

const GRACE_MS = 3000;

/** Shown when the market engine can't be reached for a few seconds. */
export function ConnectionBanner() {
  const connected = useMarket((s) => s.connected);
  const [graceOver, setGraceOver] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setGraceOver(true), GRACE_MS);
    return () => clearTimeout(timer);
  }, []);

  if (connected || !graceOver) return null;
  return (
    <div role="status" className="border-b border-rug/30 bg-rug/10 px-4 py-2 text-center text-sm text-rug">
      Can&apos;t reach the market. Reconnecting…
    </div>
  );
}

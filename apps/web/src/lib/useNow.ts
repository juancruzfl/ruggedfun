"use client";

import { useEffect, useState } from "react";

/**
 * Current time, updated every second. Starts at `serverNow` (the time the server rendered)
 * so "12s ago" labels match during hydration, then catches up on the first tick.
 */
export function useNow(serverNow: number): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

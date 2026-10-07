"use client";

import { useEffect, useRef, useState } from "react";

/** Flashes "up"/"down" briefly when `value` moves by more than `threshold` (fraction). */
export function useFlash(value: number, threshold = 0.03): "up" | "down" | null {
  const previous = useRef(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = value;
    if (!(before > 0)) return;
    const change = value / before - 1;
    if (Math.abs(change) < threshold) return;
    setFlash(change > 0 ? "up" : "down");
    const timer = setTimeout(() => setFlash(null), 800);
    return () => clearTimeout(timer);
  }, [value, threshold]);

  return flash;
}

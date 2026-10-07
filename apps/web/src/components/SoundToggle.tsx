"use client";

import { useEffect } from "react";
import { useSound } from "@/lib/sound";

export function SoundToggle() {
  const { muted, loaded, load, toggle } = useSound();
  useEffect(() => load(), [load]);

  return (
    <button
      onClick={toggle}
      aria-label={muted ? "Unmute sounds" : "Mute sounds"}
      aria-pressed={muted}
      title={muted ? "Sounds off" : "Sounds on"}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-panel hover:text-text ${
        loaded ? "" : "invisible"
      }`}
    >
      <span aria-hidden>{muted ? "🔇" : "🔊"}</span>
    </button>
  );
}

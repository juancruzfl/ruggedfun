"use client";

import { useState } from "react";

/** The ticker from a DiceBear avatar URL (its `seed`), for the fallback tile. */
function seedOf(src: string): string {
  try {
    return new URL(src).searchParams.get("seed") ?? "?";
  } catch {
    return "?";
  }
}

/**
 * Token avatar from DiceBear. If the image can't load (offline, or DiceBear rate-limits a busy
 * page), it falls back to a colored tile with the ticker's first letter.
 */
export function TokenAvatar({ src, alt, size, dim = false }: { src: string; alt: string; size: number; dim?: boolean }) {
  const [failed, setFailed] = useState(false);
  const className = `shrink-0 rounded-lg bg-panel-2 ${dim ? "opacity-50 grayscale" : ""}`;

  if (failed) {
    const seed = seedOf(src);
    let hue = 0;
    for (const c of seed) hue = (hue * 31 + c.charCodeAt(0)) % 360;
    return (
      <span
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        className={`${className} flex items-center justify-center font-bold text-black`}
        style={{ width: size, height: size, backgroundColor: `hsl(${hue} 70% 65%)`, fontSize: size * 0.45 }}
      >
        {seed.slice(0, 1)}
      </span>
    );
  }

  return (
    // Remote avatars from DiceBear; next/image would need remote config for little gain.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
      style={{ width: size, height: size }}
    />
  );
}

"use client";

import type { Callout } from "@ruggedfun/shared";
import Link from "next/link";
import { useMarket } from "@/lib/marketStore";

const kindColor: Record<Callout["kind"], string> = {
  pump: "text-pump",
  rug: "text-rug",
  graduated: "text-amber-300",
  whale: "text-sky-300",
  win: "text-pump",
  launch: "text-violet-300",
};

const SECONDS_PER_ITEM = 6;

/** Scrolling strip of pumps, rugs and graduations, pinned to the bottom of the screen. */
export function CalloutTicker() {
  const callouts = useMarket((s) => s.callouts);
  const items = [...callouts].reverse();

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex h-9 items-center overflow-hidden border-t border-line bg-panel text-sm">
      <span className="z-10 flex h-full shrink-0 items-center bg-rug px-3 text-xs font-black tracking-wider text-black">
        🌶 HOT
      </span>
      {items.length === 0 ? (
        <span className="px-4 text-muted">Waiting for something to pump…</span>
      ) : (
        <div className="group flex-1 overflow-hidden">
          {/* Two copies so the -50% translate loops seamlessly. */}
          <div
            className="flex w-max animate-marquee group-hover:[animation-play-state:paused]"
            style={{ ["--marquee-duration" as string]: `${Math.max(20, items.length * SECONDS_PER_ITEM)}s` }}
          >
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0" aria-hidden={copy === 1}>
                {items.map((c) => (
                  <Link
                    key={`${c.tokenId}-${c.kind}-${c.at}`}
                    href={`/token/${c.ticker}`}
                    tabIndex={copy === 1 ? -1 : undefined}
                    className={`whitespace-nowrap px-4 font-medium hover:underline ${kindColor[c.kind]}`}
                  >
                    {c.text}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

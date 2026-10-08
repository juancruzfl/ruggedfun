"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/** How far each card behind the front one peeks out below it, and the gap between cards when fanned out. */
const PEEK_PX = 10;
const GAP_PX = 8;
/** Cards shown in the collapsed pile (the rest wait behind, hidden). */
const MAX_VISIBLE = 3;
const SCALE_STEP = 0.05;
/** The frame's top + bottom border, which isn't part of the measured content. */
const BORDER_PX = 2;

export interface StackItem {
  key: string;
  /** Newer cards go in front. */
  at: number;
  /** Border color classes for the card's frame. */
  frame: string;
  content: ReactNode;
}

const ExpandedContext = createContext(false);

/** True while the stack is fanned out (hovered or focused). Cards pause their auto-hide meanwhile. */
export const useStackExpanded = () => useContext(ExpandedContext);

/**
 * Notifications piled on top of each other in the top-right corner: the newest in front, up to two
 * older ones peeking out below. Hovering (or tabbing into) the pile fans it out into a list.
 */
export function NotificationStack({ items }: { items: StackItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const pile = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const observer = useRef<ResizeObserver | null>(null);
  const keys = useRef(new WeakMap<Element, string>());
  const refs = useRef(new Map<string, (el: HTMLDivElement | null) => () => void>());

  // Each card's natural height, so the pile can size itself and fan out without overlaps.
  // One stable ref callback per card, so React doesn't re-attach it on every render.
  const measure = useCallback((key: string) => {
    const cached = refs.current.get(key);
    if (cached) return cached;
    const ref = (el: HTMLDivElement | null) => {
      if (!el) return () => {};
      observer.current ??= new ResizeObserver((entries) =>
        setHeights((all) => {
          let next = all;
          for (const entry of entries) {
            const k = keys.current.get(entry.target);
            const h = entry.borderBoxSize[0]?.blockSize ?? entry.target.getBoundingClientRect().height;
            if (k && next[k] !== h) {
              if (next === all) next = { ...all };
              next[k] = h;
            }
          }
          return next;
        }),
      );
      keys.current.set(el, key);
      observer.current.observe(el);
      return () => {
        observer.current?.unobserve(el);
        refs.current.delete(key);
      };
    };
    refs.current.set(key, ref);
    return ref;
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);

  // Re-check whenever cards come or go: a card removed from under the mouse, or with focus on its ×,
  // doesn't always fire mouseleave or blur, and a stuck "expanded" would pause every card forever.
  const itemKeys = items.map((i) => i.key).join();
  useEffect(() => {
    const el = pile.current;
    setExpanded(Boolean(el && (el.matches(":hover") || el.contains(document.activeElement))));
  }, [itemKeys]);

  if (items.length === 0) return null;

  const ordered = [...items].sort((a, b) => b.at - a.at);
  const heightOf = (key: string) => (heights[key] ?? 0) + BORDER_PX;
  const frontHeight = heightOf(ordered[0]!.key);

  let y = 0;
  const layout = ordered.map((item, i) => {
    const top = expanded ? y : i * PEEK_PX;
    y += heightOf(item.key) + GAP_PX;
    return { item, i, top };
  });
  const height = expanded ? y - GAP_PX : frontHeight + Math.min(ordered.length - 1, MAX_VISIBLE - 1) * PEEK_PX;

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-4 top-16 z-[35] sm:left-auto sm:w-80">
      <ExpandedContext.Provider value={expanded}>
        <div
          ref={pile}
          className="pointer-events-auto relative transition-[height] duration-300"
          style={{ height }}
          // Mouse only: a tap on a touch screen "enters" but never leaves, which would pause the pile.
          onPointerEnter={(e) => e.pointerType === "mouse" && setExpanded(true)}
          onPointerLeave={(e) => e.pointerType === "mouse" && setExpanded(false)}
          onFocus={() => setExpanded(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setExpanded(false);
          }}
        >
          {layout.map(({ item, i, top }) => {
            const behind = !expanded && i > 0;
            const hidden = !expanded && i >= MAX_VISIBLE;
            return (
              <div
                key={item.key}
                // Behind the front card, a card takes the front card's height (its content hidden),
                // so only its bottom edge peeks out, whatever its own size.
                className={`absolute inset-x-0 top-0 origin-bottom animate-toast-in overflow-hidden rounded-xl border bg-panel shadow-2xl shadow-black/60 transition-[transform,opacity,height] duration-300 ${item.frame}`}
                style={{
                  transform: `translateY(${top}px) scale(${expanded ? 1 : 1 - i * SCALE_STEP})`,
                  height: behind ? frontHeight : heightOf(item.key),
                  zIndex: ordered.length - i,
                  opacity: hidden ? 0 : 1,
                  pointerEvents: behind || hidden ? "none" : undefined,
                }}
                aria-hidden={behind || undefined}
              >
                <div ref={measure(item.key)} className={`transition-opacity duration-200 ${behind ? "opacity-0" : ""}`}>
                  {item.content}
                </div>
              </div>
            );
          })}
        </div>
      </ExpandedContext.Provider>
    </div>
  );
}

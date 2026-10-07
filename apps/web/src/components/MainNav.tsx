"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", icon: "🏠", label: "Home" },
  { href: "/feed", icon: "📡", label: "Live Feed" },
  { href: "/leaderboard", icon: "🏆", label: "Leaderboard" },
] as const;

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
}

/** Desktop navigation, inline in the top bar. The active item gets an underline along the bar's bottom edge. */
export function TopNav() {
  const isActive = useIsActive();

  return (
    <nav aria-label="Main" className="hidden h-full items-stretch md:flex">
      {ITEMS.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex items-center gap-1.5 px-3 text-sm font-medium transition ${
              active ? "text-text" : "text-muted hover:text-text"
            }`}
          >
            <span aria-hidden className="hidden xl:inline">
              {item.icon}
            </span>
            {item.label}
            {active && <span aria-hidden className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-pump" />}
          </Link>
        );
      })}
      <span
        aria-disabled="true"
        title="Token launcher coming soon"
        className="flex cursor-not-allowed items-center gap-1.5 px-3 text-sm font-medium text-muted/50"
      >
        <span aria-hidden className="hidden grayscale xl:inline">
          🚀
        </span>
        Launch
        <span className="rounded bg-panel-2 px-1 py-px text-[9px] font-bold tracking-wide">SOON</span>
      </span>
    </nav>
  );
}

/** Bottom tab bar on phones, where the top bar has no room for links. */
export function MobileNav() {
  const isActive = useIsActive();

  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-9 z-20 flex border-t border-line bg-bg/95 backdrop-blur md:hidden">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(item.href) ? "page" : undefined}
          className={`flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium ${
            isActive(item.href) ? "text-pump" : "text-muted"
          }`}
        >
          <span aria-hidden className="text-lg">
            {item.icon}
          </span>
          {item.label}
        </Link>
      ))}
      <span
        aria-disabled="true"
        title="Token launcher coming soon"
        className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] text-muted/50"
      >
        <span aria-hidden className="text-lg grayscale">
          🚀
        </span>
        Launch
      </span>
    </nav>
  );
}

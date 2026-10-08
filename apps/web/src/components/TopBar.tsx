import Link from "next/link";
import { Logo } from "./Logo";
import { TopNav } from "./MainNav";
import { NotificationBell } from "./NotificationBell";
import { SearchBar } from "./SearchBar";
import { SoundToggle } from "./SoundToggle";
import { WalletChip } from "./WalletChip";

const X_URL = "https://x.com/ruggedfunlol";

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 bg-bg/90 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 lg:gap-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight">
          <Logo className="size-6" />
          {/* The wordmark hides on tablets so the links and search fit. */}
          <span className="hidden sm:inline md:hidden lg:inline">
            <span className="text-rug">rugged</span>
            <span className="text-pump">fun</span>
          </span>
        </Link>
        <TopNav />
        <div className="flex min-w-24 flex-1 justify-end md:min-w-40 lg:justify-center">
          <SearchBar />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={X_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="ruggedfun on X (Twitter), opens in a new tab"
            title="@ruggedfunlol on X"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-panel hover:text-text focus-visible:outline-2 focus-visible:outline-pump"
          >
            {/* The X logo. */}
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
          <NotificationBell />
          <SoundToggle />
        </div>
        <WalletChip />
      </div>
      {/* Bottom edge: green fading through neutral into red, the logo's two halves. */}
      <div aria-hidden className="h-px bg-linear-to-r from-pump/50 via-line to-rug/50" />
    </header>
  );
}

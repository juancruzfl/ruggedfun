import Link from "next/link";
import { Logo } from "./Logo";
import { TopNav } from "./MainNav";
import { NotificationBell } from "./NotificationBell";
import { SearchBar } from "./SearchBar";
import { SoundToggle } from "./SoundToggle";
import { WalletChip } from "./WalletChip";

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 lg:gap-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight">
          <Logo className="size-6" />
          {/* The wordmark hides on tablets so the links and search fit. */}
          <span className="hidden sm:inline md:hidden lg:inline">
            rugged<span className="text-pump">fun</span>
          </span>
        </Link>
        <TopNav />
        <div className="flex min-w-24 flex-1 justify-end md:min-w-40 lg:justify-center">
          <SearchBar />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <NotificationBell />
          <SoundToggle />
        </div>
        <WalletChip />
      </div>
    </header>
  );
}

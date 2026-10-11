import type { Metadata } from "next";
import Link from "next/link";
import { Inter, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { CalloutTicker } from "@/components/CalloutTicker";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { MarketConnection } from "@/components/MarketConnection";
import { MomentOverlay } from "@/components/MomentOverlay";
import { OnboardingModal } from "@/components/OnboardingModal";
import { PositionAlerts } from "@/components/PositionAlerts";
import { QuickTradeModal } from "@/components/QuickTradeModal";
import { SessionProvider } from "@/components/SessionProvider";
import { MobileNav } from "@/components/MainNav";
import { Toaster } from "@/components/Toaster";
import { TopBar } from "@/components/TopBar";
import { getMe } from "@/lib/session";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  // Link previews (like a profile's PnL card) need absolute image URLs. SITE_URL overrides it (e.g. staging).
  metadataBase: new URL(process.env.SITE_URL ?? "https://ruggedfun.xyz"),
  title: { default: "ruggedfun", template: "%s · ruggedfun" },
  description: "A play-money memecoin launchpad. Everything rugs. Nothing is real.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const me = await getMe();

  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <SessionProvider initialMe={me}>
          <Toaster>
            <MarketConnection />
            <TopBar />
            <ConnectionBanner />
            {/* Bottom padding clears the callout ticker (and the mobile tab bar). */}
            <div className="pb-28 md:pb-12">
              <main>{children}</main>
              <footer className="space-y-1 px-4 py-6 text-center text-xs text-muted">
                <p>
                  A simulation for entertainment. Play money only, with no real value. Not financial advice. Not
                  affiliated with any real platform or token.
                </p>
                <p>
                  <Link href="/terms" className="hover:text-text hover:underline">
                    Terms of Use
                  </Link>
                  {" · "}
                  <Link href="/privacy" className="hover:text-text hover:underline">
                    Privacy Policy
                  </Link>
                </p>
              </footer>
            </div>
            <MobileNav />
            <CalloutTicker />
            <PositionAlerts />
            <QuickTradeModal />
            <MomentOverlay />
            <OnboardingModal />
          </Toaster>
        </SessionProvider>
      </body>
    </html>
  );
}

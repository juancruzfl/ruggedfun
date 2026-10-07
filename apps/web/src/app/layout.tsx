import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { CalloutTicker } from "@/components/CalloutTicker";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { MarketConnection } from "@/components/MarketConnection";
import { OnboardingModal } from "@/components/OnboardingModal";
import { QuickBuyModal } from "@/components/QuickBuyModal";
import { SessionProvider } from "@/components/SessionProvider";
import { MobileNav } from "@/components/MainNav";
import { Toaster } from "@/components/Toaster";
import { TopBar } from "@/components/TopBar";
import { getMe } from "@/lib/session";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "ruggedfun",
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
              <footer className="px-4 py-6 text-center text-xs text-muted">
                Simulation only. Not financial advice. Nothing here has real value.
              </footer>
            </div>
            <MobileNav />
            <CalloutTicker />
            <QuickBuyModal />
            <OnboardingModal />
          </Toaster>
        </SessionProvider>
      </body>
    </html>
  );
}

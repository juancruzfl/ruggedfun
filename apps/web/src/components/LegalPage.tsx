import type { ReactNode } from "react";

/** Shared layout for the Terms and Privacy pages: readable prose on the dark theme. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 text-[15px] leading-relaxed text-text/90 [&_a]:text-pump [&_a:hover]:underline [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-text [&_li]:mt-1 [&_p]:mt-3 [&_strong]:text-text [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-6">
      <h1 className="text-3xl font-bold text-text">{title}</h1>
      <p className="!mt-1 text-sm text-muted">Last updated: {updated}</p>
      {children}
    </article>
  );
}

/** The one-paragraph version, shown at the top of both pages. */
export function SimulationNotice() {
  return (
    <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-100">
      <strong className="text-amber-300">ruggedfun is a game.</strong> Everything on this site is simulated: the tokens,
      prices, market caps, traders, trades, holders, chat messages and leaderboards. &ldquo;SOL&rdquo; here is fake play
      money with <strong>no real-world value</strong>. It can&apos;t be bought, sold, withdrawn or exchanged for
      anything. No real cryptocurrency or blockchain is involved, and nothing here is financial advice.
    </div>
  );
}

export const LEGAL_UPDATED = "October 9, 2026";
export const CONTACT_URL = "https://github.com/juancruzfl/ruggedfun/issues";

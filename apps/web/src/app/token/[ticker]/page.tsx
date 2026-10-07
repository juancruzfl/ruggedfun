import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TokenView } from "@/components/TokenView";
import { getMe } from "@/lib/session";
import { findTokenByTicker, getRealizedPnl, getRecentTrades, getVolumeSol } from "@/lib/tokens";

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }): Promise<Metadata> {
  const { ticker } = await params;
  const token = await findTokenByTicker(decodeURIComponent(ticker).toUpperCase());
  return { title: token ? `$${token.ticker} · ${token.name}` : "Token not found" };
}

export default async function TokenPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const token = await findTokenByTicker(decodeURIComponent(ticker).toUpperCase());
  if (!token) notFound();

  const me = await getMe();
  const [trades, volumeSol, realizedPnl] = await Promise.all([
    getRecentTrades(token),
    getVolumeSol(token.id),
    me ? getRealizedPnl(me.user.id, token.id) : { realized: 0, soldCost: 0 },
  ]);
  return (
    <TokenView
      initial={token}
      initialTrades={trades}
      initialVolumeSol={volumeSol}
      initialRealized={realizedPnl}
      renderedAt={Date.now()}
    />
  );
}

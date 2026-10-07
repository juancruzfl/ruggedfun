import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TokenView } from "@/components/TokenView";
import { getMe } from "@/lib/session";
import { findTokenByTicker, getRecentTrades, getTokenFlows, getVolume } from "@/lib/tokens";

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
  const [trades, volume, flows] = await Promise.all([
    getRecentTrades(token),
    getVolume(token.id),
    me ? getTokenFlows(me.user.id, token.id) : { boughtSol: 0, boughtTokens: 0, soldSol: 0 },
  ]);
  return (
    <TokenView
      initial={token}
      initialTrades={trades}
      initialVolume={volume}
      initialFlows={flows}
      renderedAt={Date.now()}
    />
  );
}

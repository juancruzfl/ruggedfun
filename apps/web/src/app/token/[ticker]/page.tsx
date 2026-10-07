import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TokenView } from "@/components/TokenView";
import { findTokenByTicker, getRecentTrades, getVolumeSol } from "@/lib/tokens";

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }): Promise<Metadata> {
  const { ticker } = await params;
  const token = await findTokenByTicker(decodeURIComponent(ticker).toUpperCase());
  return { title: token ? `$${token.ticker} · ${token.name}` : "Token not found" };
}

export default async function TokenPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const token = await findTokenByTicker(decodeURIComponent(ticker).toUpperCase());
  if (!token) notFound();

  const [trades, volumeSol] = await Promise.all([getRecentTrades(token), getVolumeSol(token.id)]);
  return <TokenView initial={token} initialTrades={trades} initialVolumeSol={volumeSol} renderedAt={Date.now()} />;
}

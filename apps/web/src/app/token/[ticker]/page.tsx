import { notFound } from "next/navigation";
import { TokenView } from "@/components/TokenView";
import { findTokenByTicker, getRecentTrades, getVolumeSol } from "@/lib/tokens";

export default async function TokenPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const token = await findTokenByTicker(decodeURIComponent(ticker).toUpperCase());
  if (!token) notFound();

  const [trades, volumeSol] = await Promise.all([getRecentTrades(token), getVolumeSol(token.id)]);
  return <TokenView initial={token} initialTrades={trades} initialVolumeSol={volumeSol} renderedAt={Date.now()} />;
}

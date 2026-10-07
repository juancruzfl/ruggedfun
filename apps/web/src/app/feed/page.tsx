import type { Metadata } from "next";
import { LiveFeed } from "@/components/LiveFeed";
import { getRecentTradesAll } from "@/lib/tokens";

export const metadata: Metadata = { title: "Live Feed" };

export default async function FeedPage() {
  return <LiveFeed initial={await getRecentTradesAll()} renderedAt={Date.now()} />;
}

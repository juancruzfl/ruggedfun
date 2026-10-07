import { LiveFeed } from "@/components/LiveFeed";
import { getRecentTradesAll } from "@/lib/tokens";

export default async function FeedPage() {
  return <LiveFeed initial={await getRecentTradesAll()} renderedAt={Date.now()} />;
}

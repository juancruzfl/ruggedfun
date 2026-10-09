import { HouseTokenHero } from "@/components/HouseTokenHero";
import { PlayerStatsCard } from "@/components/PlayerStatsCard";
import { TokenGrid } from "@/components/TokenGrid";
import { TrendingRow } from "@/components/TrendingRow";
import { getPlayerStats } from "@/lib/playerStats";

export default async function Home() {
  // The players widget is extra: if its stats can't be loaded, the page renders without it.
  const playerStats = await getPlayerStats().catch(() => null);

  return (
    <div className="space-y-8 px-4 py-6">
      {/* $RUGGEDFUN and the players card side by side on desktop, stacked on smaller screens. */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <HouseTokenHero />
        {playerStats && <PlayerStatsCard initial={playerStats} />}
      </div>
      <TrendingRow />
      <TokenGrid />
    </div>
  );
}

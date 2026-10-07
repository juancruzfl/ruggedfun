import { TokenGrid } from "@/components/TokenGrid";
import { TrendingRow } from "@/components/TrendingRow";

export default function Home() {
  return (
    <div className="space-y-8 px-4 py-6">
      <TrendingRow />
      <TokenGrid />
    </div>
  );
}

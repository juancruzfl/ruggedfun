import { HouseTokenHero } from "@/components/HouseTokenHero";
import { TokenGrid } from "@/components/TokenGrid";
import { TrendingRow } from "@/components/TrendingRow";

// Two faint glows behind the top of the page, green on the left and red on the right, like the pill logo.
const glow = [
  "radial-gradient(ellipse 55% 100% at 10% 0%, color-mix(in oklab, var(--color-pump) 9%, transparent), transparent 70%)",
  "radial-gradient(ellipse 45% 90% at 90% 0%, color-mix(in oklab, var(--color-rug) 7%, transparent), transparent 70%)",
].join(", ");

export default function Home() {
  return (
    <div className="relative isolate space-y-8 px-4 py-6">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96" style={{ backgroundImage: glow }} />
      <HouseTokenHero />
      <TrendingRow />
      <TokenGrid />
    </div>
  );
}

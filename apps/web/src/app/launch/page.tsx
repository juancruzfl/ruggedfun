import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Launch a token" };

export default function LaunchPage() {
  return (
    <ComingSoon icon="🚀" title="Launch your own token">
      Pick a name, a ticker and a picture, pay a little fake SOL, and watch the market decide. Your token gets a
      fate rolled just like every other launch, so even you won&apos;t know if it moons or rugs. Coming soon.
    </ComingSoon>
  );
}

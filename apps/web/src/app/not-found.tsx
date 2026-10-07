import Link from "next/link";
import { ComingSoon } from "@/components/ComingSoon";

export default function NotFound() {
  return (
    <ComingSoon icon="🕳️" title="Nothing here">
      That token doesn&apos;t exist. Maybe it was never real.{" "}
      <Link href="/" className="text-pump hover:underline">
        Back to the market
      </Link>
    </ComingSoon>
  );
}

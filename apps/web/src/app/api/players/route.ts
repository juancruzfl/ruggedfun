import { NextResponse } from "next/server";
import { getPlayerStats } from "@/lib/playerStats";

/** Player-only stats for the home page widget (cached for 30 seconds). */
export async function GET() {
  return NextResponse.json(await getPlayerStats());
}

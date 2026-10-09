import { NextResponse } from "next/server";
import { recentPlayerLaunches, recentRugged } from "@/lib/tokens";

/**
 * Only the graveyard and player launches need the database (both include tokens that stopped
 * trading): the other front-page tabs are built in the browser from the engine's live snapshot.
 */
export async function GET(req: Request) {
  const tab = new URL(req.url).searchParams.get("tab");
  if (tab === "rugged") return NextResponse.json(await recentRugged());
  if (tab === "players") return NextResponse.json(await recentPlayerLaunches());
  return NextResponse.json({ error: "Unknown tab" }, { status: 400 });
}

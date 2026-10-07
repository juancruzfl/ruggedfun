import { NextResponse } from "next/server";
import { getLeaderboard, LEADERBOARD_TABS, type LeaderboardTab } from "@/lib/leaderboard";

const TOP = 100;

export async function GET(req: Request) {
  const tab = (new URL(req.url).searchParams.get("tab") ?? "all") as LeaderboardTab;
  if (!LEADERBOARD_TABS.includes(tab)) return NextResponse.json({ error: "Unknown tab" }, { status: 400 });
  const { rows } = await getLeaderboard(tab);
  return NextResponse.json({ tab, total: rows.length, rows: rows.slice(0, TOP) });
}

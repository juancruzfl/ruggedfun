import { NextResponse } from "next/server";
import { recentRugged } from "@/lib/tokens";

/**
 * Only the graveyard needs the database: the other front-page tabs are built
 * in the browser from the engine's live snapshot.
 */
export async function GET(req: Request) {
  const tab = new URL(req.url).searchParams.get("tab");
  if (tab !== "rugged") return NextResponse.json({ error: "Unknown tab" }, { status: 400 });
  return NextResponse.json(await recentRugged());
}

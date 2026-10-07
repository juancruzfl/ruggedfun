import { CANDLE_INTERVALS, type CandleInterval } from "@ruggedfun/shared";
import { NextResponse } from "next/server";
import { getCandles } from "@/lib/tokens";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const interval = Number(new URL(req.url).searchParams.get("interval") ?? 5) as CandleInterval;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  if (!CANDLE_INTERVALS.includes(interval)) return NextResponse.json({ error: "Invalid interval" }, { status: 400 });
  return NextResponse.json(await getCandles(id, interval));
}

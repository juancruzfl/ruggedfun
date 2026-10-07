import { NextResponse } from "next/server";
import { searchTokens } from "@/lib/tokens";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json(await searchTokens(q));
}

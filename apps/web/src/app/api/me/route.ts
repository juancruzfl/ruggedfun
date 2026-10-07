import { NextResponse } from "next/server";
import { getMe } from "@/lib/session";

export async function GET() {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json(me);
}

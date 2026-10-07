import { users } from "@ruggedfun/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getMe, SESSION_COOKIE } from "@/lib/session";

export async function GET() {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json(me);
}

/**
 * Deletes the signed-in account: wallet, positions, rug history and snapshots go with it
 * (cascade). Past trades stay in the market history without a user attached.
 */
export async function DELETE() {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  await db.delete(users).where(eq(users.id, me.user.id));
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

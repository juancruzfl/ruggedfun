import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

/**
 * Signs this browser out so the player can start a new account. The old account isn't touched:
 * its trades and leaderboard history stay. (There's no login, so it can't be signed back into.)
 */
export function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

import { NextResponse } from "next/server";

/** Liveness check for the host. Doesn't touch the database. */
export function GET() {
  return NextResponse.json({ ok: true });
}

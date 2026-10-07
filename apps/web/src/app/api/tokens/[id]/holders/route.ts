import { NextResponse } from "next/server";
import { getMe } from "@/lib/session";
import { getHolders } from "@/lib/tokens";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  const me = await getMe();
  return NextResponse.json(await getHolders(id, { me: me?.user.username }));
}

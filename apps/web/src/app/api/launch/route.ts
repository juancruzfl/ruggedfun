import type { LaunchRequest, LaunchResult } from "@ruggedfun/shared";
import { NextResponse } from "next/server";
import { getMe } from "@/lib/session";

const ENGINE_URL = process.env.ENGINE_INTERNAL_URL ?? "http://localhost:3001";
const ENGINE_SECRET = process.env.ENGINE_SECRET;

const error = (message: string, status: number) => NextResponse.json({ error: message }, { status });

/** Signs the launch with the user's identity and forwards it to the engine, which validates and runs it. */
export async function POST(req: Request) {
  if (!ENGINE_SECRET) return error("Launching isn't configured (ENGINE_SECRET missing)", 500);
  const me = await getMe();
  if (!me) return error("Create a wallet first", 401);

  const body = (await req.json().catch(() => null)) as Partial<LaunchRequest> | null;
  if (!body) return error("Invalid request", 400);

  let res: Response;
  try {
    res = await fetch(`${ENGINE_URL}/internal/launch`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-engine-secret": ENGINE_SECRET },
      body: JSON.stringify({
        name: body.name,
        ticker: body.ticker,
        description: body.description,
        avatarStyle: body.avatarStyle,
        avatarSeed: body.avatarSeed,
        devBuySol: body.devBuySol,
        userId: me.user.id,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return error("The market is offline. Try again in a moment.", 503);
  }

  const result = (await res.json().catch(() => ({ error: "Launch failed" }))) as LaunchResult | { error: string };
  return NextResponse.json(result, { status: res.status });
}

import type { TradeRequest, TradeResult } from "@ruggedfun/shared";
import { NextResponse } from "next/server";
import { createRateLimiter } from "@/lib/rateLimit";
import { getMe } from "@/lib/session";

const ENGINE_URL = process.env.ENGINE_INTERNAL_URL ?? "http://localhost:3001";
const ENGINE_SECRET = process.env.ENGINE_SECRET;

const allowTrade = createRateLimiter(10, 10_000);

const error = (message: string, status: number) => NextResponse.json({ error: message }, { status });

/**
 * Signs the trade with the user's identity and forwards it to the engine, which owns the
 * live curve and does the actual fill. Validation of the trade itself happens there.
 */
export async function POST(req: Request) {
  if (!ENGINE_SECRET) return error("Trading isn't configured (ENGINE_SECRET missing)", 500);
  const me = await getMe();
  if (!me) return error("Create a wallet first", 401);
  if (!allowTrade(me.user.id)) return error("Slow down. Too many trades.", 429);

  const body = (await req.json().catch(() => null)) as Partial<TradeRequest> | null;
  if (!body) return error("Invalid request", 400);

  let res: Response;
  try {
    res = await fetch(`${ENGINE_URL}/internal/trade`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-engine-secret": ENGINE_SECRET },
      body: JSON.stringify({
        tokenId: body.tokenId,
        side: body.side,
        amount: body.amount,
        expectedPrice: body.expectedPrice,
        slippageBps: body.slippageBps,
        userId: me.user.id,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return error("The market is offline. Try again in a moment.", 503);
  }

  const result = (await res.json().catch(() => ({ error: "Trade failed" }))) as TradeResult | { error: string };
  return NextResponse.json(result, { status: res.status });
}

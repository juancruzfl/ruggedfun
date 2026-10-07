import { users, wallets } from "@ruggedfun/db";
import { STARTING_SOL, validateUsername, type Me } from "@ruggedfun/shared";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientIp, createRateLimiter } from "@/lib/rateLimit";
import { getMe, hashSessionToken, newSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { generateWalletAddress } from "@/lib/wallet";

const allowSignup = createRateLimiter(5, 60 * 60_000);

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

const error = (message: string, status: number) => NextResponse.json({ error: message }, { status });

/** Creates a user with a fresh play-money wallet and signs them in. */
export async function POST(req: Request) {
  if (await getMe()) return error("You already have a wallet", 409);

  const body = (await req.json().catch(() => null)) as { username?: unknown } | null;
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const invalid = validateUsername(username);
  if (invalid) return error(invalid, 400);

  if (!allowSignup(clientIp(req))) return error("Too many new wallets from here. Try again later.", 429);

  const token = newSessionToken();
  let me: Me;
  try {
    me = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ username, sessionHash: hashSessionToken(token) })
        .returning();
      const [wallet] = await tx
        .insert(wallets)
        .values({ userId: user!.id, address: generateWalletAddress(), solBalance: STARTING_SOL })
        .returning();
      return {
        user: { id: user!.id, username: user!.username, createdAt: user!.createdAt.getTime() },
        wallet: { address: wallet!.address, solBalance: wallet!.solBalance },
        positions: [],
      };
    });
  } catch (err) {
    if (isUniqueViolation(err)) return error("That username is taken", 409);
    throw err;
  }

  const res = NextResponse.json(me, { status: 201 });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}

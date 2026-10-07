import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { positions, tokens, users, wallets } from "@ruggedfun/db";
import type { Me, PositionSummary } from "@ruggedfun/shared";
import { desc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "./db";

export const SESSION_COOKIE = "rf_session";
const ONE_YEAR_SECONDS = 365 * 24 * 3600;

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only the hash is stored, so a database leak doesn't hand out sessions. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: ONE_YEAR_SECONDS,
} as const;

/** The signed-in user and wallet, or null if the session cookie is missing or unknown. */
export async function getMe(): Promise<Me | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({
      id: users.id,
      username: users.username,
      createdAt: users.createdAt,
      address: wallets.address,
      solBalance: wallets.solBalance,
    })
    .from(users)
    .innerJoin(wallets, eq(wallets.userId, users.id))
    .where(eq(users.sessionHash, hashSessionToken(token)))
    .limit(1);
  if (!row) return null;

  return {
    user: { id: row.id, username: row.username, createdAt: row.createdAt.getTime() },
    wallet: { address: row.address, solBalance: row.solBalance },
    positions: await getPositions(row.id),
  };
}

export async function getPositions(userId: string): Promise<PositionSummary[]> {
  return db
    .select({
      tokenId: positions.tokenId,
      ticker: tokens.ticker,
      name: tokens.name,
      imageUrl: tokens.imageUrl,
      tokenAmount: positions.tokenAmount,
      costBasisSol: positions.costBasisSol,
      lastPrice: tokens.price,
    })
    .from(positions)
    .innerJoin(tokens, eq(tokens.id, positions.tokenId))
    .where(eq(positions.userId, userId))
    .orderBy(desc(positions.costBasisSol));
}

/** Play-money SOL every new wallet starts with. */
export const STARTING_SOL = 10;

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 16;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

// Substring match, so keep entries specific enough not to block normal names.
const BLOCKED = ["nigg", "fag", "retard", "rape", "nazi", "hitler", "kike", "tranny", "cunt", "admin", "moderator", "ruggedfun"];

/** Returns an error message, or null if the username is acceptable. Uniqueness is checked by the server. */
export function validateUsername(username: string): string | null {
  if (username.length < USERNAME_MIN) return `At least ${USERNAME_MIN} characters`;
  if (username.length > USERNAME_MAX) return `At most ${USERNAME_MAX} characters`;
  if (!USERNAME_PATTERN.test(username)) return "Letters, numbers and _ only";
  const lower = username.toLowerCase();
  if (BLOCKED.some((word) => lower.includes(word))) return "Pick a different name";
  return null;
}

import type { PositionSummary } from "./trading";

export interface Me {
  user: { id: string; username: string; createdAt: number };
  wallet: { address: string; solBalance: number };
  positions: PositionSummary[];
}

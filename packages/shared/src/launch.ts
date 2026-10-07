import { containsBlocked } from "./account";
import type { MarketToken } from "./index";
import type { PositionSummary } from "./trading";

/** Fake SOL a player pays to launch a token. */
export const LAUNCH_COST_SOL = 0.5;
/** Launches allowed per player per rolling hour. */
export const LAUNCHES_PER_HOUR = 3;
/** Biggest dev buy allowed at launch. */
export const MAX_DEV_BUY_SOL = 5;

export const TOKEN_NAME_MAX = 24;
export const TICKER_MAX = 10;
export const DESCRIPTION_MAX = 140;

/** Real coins' tickers, so player tokens can't pose as them. */
const RESERVED_TICKERS = new Set([
  "SOL", "BTC", "ETH", "USDC", "USDT", "BNB", "XRP", "DOGE", "SHIB", "PEPE", "BONK", "WIF", "TRUMP", "PUMP",
  "ADA", "AVAX", "DOT", "LINK", "TRX", "TON", "SUI", "JUP", "RAY", "WSOL",
]);

/** DiceBear styles offered in the avatar picker. */
export const AVATAR_STYLES = ["fun-emoji", "bottts", "thumbs", "pixel-art", "shapes", "adventurer"] as const;
export type AvatarStyle = (typeof AVATAR_STYLES)[number];
const SEED_PATTERN = /^[A-Za-z0-9-]{1,32}$/;

/** The image URL for a picked avatar. Built server-side from a known style and a plain seed. */
export function avatarUrl(style: AvatarStyle, seed: string): string {
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
}

export interface LaunchRequest {
  name: string;
  ticker: string;
  description: string;
  avatarStyle: AvatarStyle;
  avatarSeed: string;
  /** SOL for the creator's own buy right at launch; 0 for none. */
  devBuySol: number;
}

export interface LaunchResult {
  token: MarketToken;
  solBalance: number;
  /** The creator's position from the dev buy, if they made one. */
  position: PositionSummary | null;
}

/** Tickers are stored uppercase without a leading "$". */
export function normalizeTicker(ticker: string): string {
  return ticker.trim().replace(/^\$/, "").toUpperCase();
}

/** Field-by-field errors for a launch, or an empty object if it's valid. Shared by the form and the server. */
export function validateLaunch(req: Partial<LaunchRequest>): Partial<Record<keyof LaunchRequest, string>> {
  const errors: Partial<Record<keyof LaunchRequest, string>> = {};
  const name = (req.name ?? "").trim();
  const ticker = normalizeTicker(req.ticker ?? "");
  const description = (req.description ?? "").trim();

  if (name.length < 2) errors.name = "At least 2 characters";
  else if (name.length > TOKEN_NAME_MAX) errors.name = `At most ${TOKEN_NAME_MAX} characters`;
  else if (!/^[\p{L}\p{N} .'!?&-]+$/u.test(name)) errors.name = "Letters, numbers, spaces and . ' ! ? & - only";
  else if (containsBlocked(name)) errors.name = "Pick a different name";

  if (ticker.length < 2) errors.ticker = "At least 2 characters";
  else if (ticker.length > TICKER_MAX) errors.ticker = `At most ${TICKER_MAX} characters`;
  else if (!/^[A-Z0-9]+$/.test(ticker)) errors.ticker = "Letters and numbers only";
  else if (RESERVED_TICKERS.has(ticker)) errors.ticker = "That's a real coin's ticker";
  else if (containsBlocked(ticker)) errors.ticker = "Pick a different ticker";

  if (description.length > DESCRIPTION_MAX) errors.description = `At most ${DESCRIPTION_MAX} characters`;
  else if (containsBlocked(description)) errors.description = "Keep it clean";

  if (!AVATAR_STYLES.includes(req.avatarStyle as AvatarStyle) || !SEED_PATTERN.test(req.avatarSeed ?? "")) {
    errors.avatarStyle = "Pick an image";
  }

  const devBuy = req.devBuySol ?? 0;
  if (!Number.isFinite(devBuy) || devBuy < 0) errors.devBuySol = "Can't be negative";
  else if (devBuy > MAX_DEV_BUY_SOL) errors.devBuySol = `At most ${MAX_DEV_BUY_SOL} SOL`;
  else if (devBuy > 0 && devBuy < 0.001) errors.devBuySol = "At least 0.001 SOL, or 0";

  return errors;
}

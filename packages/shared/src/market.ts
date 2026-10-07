import type { MarketToken } from "./index";

/**
 * The launchpad's own token. The engine creates it on startup if it's missing; it trades like any
 * other token but never rugs, dies or graduates. The home page features it above everything else.
 */
export const HOUSE_TOKEN = {
  ticker: "RUGGEDFUN",
  name: "ruggedfun",
  description: "The official token of ruggedfun. The only coin here that can't rug. Probably.",
  creatorHandle: "ruggedfun",
  /** Served by the web app (apps/web/public). */
  imageUrl: "/ruggedfun-token.svg",
} as const;

export const isHouseToken = (token: { ticker: string }) => token.ticker === HOUSE_TOKEN.ticker;

/** Fixed fake SOL price, so market caps can be shown in dollars like real launchpads do. */
export const SOL_USD = 150;

/**
 * Ranking for the trending row: 5-minute volume, boosted by momentum, decaying with age.
 * Volume is log-scaled so one whale can't pin a token to #1.
 */
export function trendingScore(token: MarketToken, now: number): number {
  if (token.status !== "live" && token.status !== "graduated") return -Infinity;
  const volume = Math.log1p(token.volume5m);
  const momentum = 1 + Math.max(-0.5, Math.min(token.change5m, 3));
  const ageHours = (now - token.createdAt) / 3_600_000;
  return (volume * momentum) / (1 + ageHours);
}

import type { MarketToken } from "./index";

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

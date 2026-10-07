import type { MarketToken } from "@ruggedfun/shared";
import { liquidationValue } from "@ruggedfun/sim";

/**
 * What a position is really worth: the SOL selling it right now would return (price impact and
 * fee included). Not tokens × price, which a player's own buy inflates on a thin curve.
 * Tokens that stopped trading can't be sold, so they keep their last price.
 */
export function positionValue(tokenAmount: number, token: MarketToken | undefined, lastPrice: number): number {
  if (token && token.endedAt === null) return liquidationValue(token.curve, token.price, tokenAmount);
  return tokenAmount * (token?.price ?? lastPrice);
}

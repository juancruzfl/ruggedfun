/**
 * pump.fun-style constant-product bonding curve with virtual reserves.
 * Amounts are in SOL and whole tokens. Everything is play money.
 */
export const CURVE = {
  virtualSol: 30,
  virtualTokens: 1_073_000_000,
  /** Tokens sold through the curve before the token graduates. */
  curveTokens: 793_100_000,
  totalSupply: 1_000_000_000,
  feeBps: 100,
} as const;

export interface CurveState {
  virtualSol: number;
  virtualTokens: number;
  /** Tokens still available on the curve. 0 means graduated. */
  tokensLeft: number;
}

export interface Fill {
  state: CurveState;
  /** SOL paid in (buy, fee included) or received (sell, fee deducted). */
  solAmount: number;
  tokenAmount: number;
  feeSol: number;
}

export function initialCurve(): CurveState {
  return { virtualSol: CURVE.virtualSol, virtualTokens: CURVE.virtualTokens, tokensLeft: CURVE.curveTokens };
}

export function spotPrice(state: CurveState): number {
  return state.virtualSol / state.virtualTokens;
}

export function marketCapSol(price: number): number {
  return price * CURVE.totalSupply;
}

export const LAUNCH_PRICE = spotPrice(initialCurve());

export const GRADUATION_PRICE = (() => {
  const virtualTokens = CURVE.virtualTokens - CURVE.curveTokens;
  const virtualSol = (CURVE.virtualSol * CURVE.virtualTokens) / virtualTokens;
  return virtualSol / virtualTokens;
})();

/** How many times the launch price a token must reach to graduate (~14.7x). */
export const GRADUATION_MULTIPLE = GRADUATION_PRICE / LAUNCH_PRICE;

const feeOn = (sol: number) => (sol * CURVE.feeBps) / 10_000;

/** Buy with up to `solIn` SOL. Fills partially if the curve runs out of tokens. */
export function quoteBuy(state: CurveState, solIn: number): Fill {
  if (!(solIn > 0)) throw new Error("solIn must be positive");
  if (state.tokensLeft <= 0) throw new Error("curve is complete");

  const k = state.virtualSol * state.virtualTokens;
  // Fee is charged on top of what goes into the curve, so solToCurve + fee = solIn.
  let solToCurve = solIn / (1 + CURVE.feeBps / 10_000);
  let tokenAmount = state.virtualTokens - k / (state.virtualSol + solToCurve);
  if (tokenAmount > state.tokensLeft) {
    tokenAmount = state.tokensLeft;
    solToCurve = k / (state.virtualTokens - tokenAmount) - state.virtualSol;
  }
  const feeSol = feeOn(solToCurve);
  return {
    state: {
      virtualSol: state.virtualSol + solToCurve,
      virtualTokens: state.virtualTokens - tokenAmount,
      tokensLeft: state.tokensLeft - tokenAmount,
    },
    solAmount: solToCurve + feeSol,
    tokenAmount,
    feeSol,
  };
}

export function quoteSell(state: CurveState, tokensIn: number): Fill {
  if (!(tokensIn > 0)) throw new Error("tokensIn must be positive");
  if (tokensIn > CURVE.curveTokens - state.tokensLeft) throw new Error("more tokens than were bought from the curve");

  const k = state.virtualSol * state.virtualTokens;
  const grossSol = state.virtualSol - k / (state.virtualTokens + tokensIn);
  const feeSol = feeOn(grossSol);
  return {
    state: {
      virtualSol: state.virtualSol - grossSol,
      virtualTokens: state.virtualTokens + tokensIn,
      tokensLeft: state.tokensLeft + tokensIn,
    },
    solAmount: grossSol - feeSol,
    tokenAmount: tokensIn,
    feeSol,
  };
}

/**
 * Share of curve tokens sold (0–1) for a given price: the pump.fun progress bar.
 * The price is mapped back onto the curve, so it's 0 at launch and 1 at graduation.
 */
export function bondingProgress(price: number): number {
  const k = CURVE.virtualSol * CURVE.virtualTokens;
  const sold = CURVE.virtualTokens - Math.sqrt(k / price);
  return Math.min(1, Math.max(0, sold / CURVE.curveTokens));
}

export type TradeSide = "buy" | "sell";

export interface TradeQuote {
  side: TradeSide;
  /** SOL paid (buy, fee included) or received (sell, fee deducted). */
  solAmount: number;
  tokenAmount: number;
  feeSol: number;
  /** Average fill price, SOL per token. */
  avgPrice: number;
  /** Price right after the trade. */
  priceAfter: number;
  curve: CurveState;
}

/**
 * Fill against a curve whose price is scaled by the token's fate multiple
 * (price = multiple × spotPrice(curve)). SOL is converted to curve units by dividing
 * by the multiple, so a round trip at a constant multiple only loses fees.
 * `amount` is SOL for buys and tokens for sells.
 */
export function quoteTrade(curve: CurveState, multiple: number, side: TradeSide, amount: number): TradeQuote {
  if (!(multiple > 0)) throw new Error("multiple must be positive");
  const fill = side === "buy" ? quoteBuy(curve, amount / multiple) : quoteSell(curve, amount);
  const solAmount = fill.solAmount * multiple;
  return {
    side,
    solAmount,
    tokenAmount: fill.tokenAmount,
    feeSol: fill.feeSol * multiple,
    avgPrice: solAmount / fill.tokenAmount,
    priceAfter: multiple * spotPrice(fill.state),
    curve: fill.state,
  };
}

/** Tokens bought from the curve and not yet sold back: the most a sell can take. */
export function tokensSold(curve: CurveState): number {
  return CURVE.curveTokens - curve.tokensLeft;
}

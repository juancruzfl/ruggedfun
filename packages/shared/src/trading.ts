import type { CurveState, TradeSide } from "@ruggedfun/sim";

export type { CurveState, TradeSide };

/** Default and maximum slippage a trade will accept, in basis points. */
export const DEFAULT_SLIPPAGE_BPS = 1000;
export const MAX_SLIPPAGE_BPS = 5000;
export const MIN_BUY_SOL = 0.001;

/** What the browser sends to POST /api/trade. */
export interface TradeRequest {
  tokenId: string;
  side: TradeSide;
  /** SOL for buys, tokens for sells. */
  amount: number;
  /** Average price the browser quoted. The trade fails if the fill is worse than this by more than the slippage. */
  expectedPrice: number;
  slippageBps?: number;
}

/** A filled trade, as broadcast to every client. */
export interface TradeEvent {
  id: string;
  tokenId: string;
  ticker: string;
  name: string;
  imageUrl: string;
  side: TradeSide;
  solAmount: number;
  tokenAmount: number;
  /** Average fill price, SOL per token. */
  price: number;
  /** Username, or bot handle. */
  trader: string;
  isBot: boolean;
  /** The token's creator (launch buy, or the rug dump). */
  isDev: boolean;
  /** Player sells only: proceeds minus the cost basis of the tokens sold. */
  realizedPnlSol: number | null;
  /** Unix ms. */
  at: number;
  /** Token state after the trade. */
  priceAfter: number;
  curve: CurveState;
}

export interface PositionSummary {
  tokenId: string;
  ticker: string;
  name: string;
  imageUrl: string;
  tokenAmount: number;
  costBasisSol: number;
  /** Last stored price; use the live price instead when the token is still trading. */
  lastPrice: number;
}

export interface TradeResult {
  trade: TradeEvent;
  solBalance: number;
  /** Null when the sell closed the position. */
  position: PositionSummary | null;
}

import { SOL_USD } from "@ruggedfun/shared";

/** Market cap in SOL → "$12.4K". */
export function formatUsd(sol: number): string {
  const usd = sol * SOL_USD;
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(2)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(1)}K`;
  return `$${usd.toFixed(0)}`;
}

/**
 * SOL price split for memecoin-style zero compression: 0.0000000281 → { zeros: 7, digits: "281" },
 * shown as 0.0₇281. Prices ≥ 0.001 come back as plain text with zeros = 0.
 */
export function priceParts(price: number): { zeros: number; digits: string } {
  if (!(price > 0)) return { zeros: 0, digits: "0" };
  if (price >= 0.001) return { zeros: 0, digits: price.toPrecision(4) };
  const exponent = Math.floor(Math.log10(price));
  return { zeros: -exponent - 1, digits: String(Math.round(price / 10 ** (exponent - 2))) };
}

/** 0.123 → "+12.3%", 12.5 → "+1,250%". */
export function formatPct(fraction: number): string {
  const pct = fraction * 100;
  // Anything that would print as ±0.0% is just flat (no red "-0.0%").
  if (Math.abs(pct) < 0.05) return "0.0%";
  const sign = pct > 0 ? "+" : "";
  if (Math.abs(pct) >= 1000) return `${sign}${Math.round(pct).toLocaleString("en-US")}%`;
  return `${sign}${pct.toFixed(1)}%`;
}

export function timeAgo(ms: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - ms) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

/** 12345678 → "12.3M". */
export function formatTokens(amount: number): string {
  if (amount >= 1e9) return `${(amount / 1e9).toFixed(2)}B`;
  if (amount >= 1e6) return `${(amount / 1e6).toFixed(2)}M`;
  if (amount >= 1e3) return `${(amount / 1e3).toFixed(1)}K`;
  return amount.toFixed(amount >= 1 ? 0 : 4);
}

export function formatSol(sol: number): string {
  if (sol === 0) return "0";
  if (Math.abs(sol) >= 1) return sol.toFixed(2);
  if (Math.abs(sol) >= 0.01) return sol.toFixed(3);
  return sol.toPrecision(2);
}

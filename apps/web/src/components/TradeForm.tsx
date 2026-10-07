"use client";

import { DEFAULT_SLIPPAGE_BPS, type TradeSide } from "@ruggedfun/shared";
import { useState, type FormEvent } from "react";
import { formatPct, formatSol, formatTokens } from "@/lib/format";
import { useMarket } from "@/lib/marketStore";
import { quoteFor, useSubmitTrade } from "@/lib/useTrade";
import { useSession } from "./SessionProvider";

const BUY_PRESETS = [0.1, 0.5, 1] as const;
const SELL_PRESETS = [0.25, 0.5, 0.75, 1] as const;

/** Buy/sell form. `fixedSide` hides the tabs (the quick-trade modal is one side at a time). */
export function TradeForm({
  tokenId,
  ticker: tickerProp,
  fixedSide,
  autoFocus = false,
  onDone,
}: {
  tokenId: string;
  /** Shown when the token isn't in the live market (it stopped trading). */
  ticker?: string;
  fixedSide?: TradeSide;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const token = useMarket((s) => s.tokens[tokenId]);
  const { me } = useSession();
  const [side, setSide] = useState<TradeSide>(fixedSide ?? "buy");
  const [input, setInput] = useState("");
  const { submit, pending, error, clearError } = useSubmitTrade();

  const held = me?.positions.find((p) => p.tokenId === tokenId)?.tokenAmount ?? 0;
  const balance = me?.wallet.solBalance ?? 0;
  const amount = Number(input) || 0;
  const { quote, problem } = quoteFor(token, me, side, amount);
  const impact = quote && token ? quote.avgPrice / token.price - 1 : 0;

  function setAmount(value: number) {
    clearError();
    setInput(value > 0 ? String(value) : "");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !quote || problem) return;
    if (await submit(token, side, amount, quote)) {
      setInput("");
      onDone?.();
    }
  }

  const ticker = token?.ticker ?? tickerProp ?? "";
  const unit = side === "buy" ? "SOL" : `$${ticker}`;

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {!fixedSide && (
        <div role="tablist" className="grid grid-cols-2 gap-1 rounded-lg bg-bg p-1">
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={side === s}
              onClick={() => {
                setSide(s);
                setInput("");
                clearError();
              }}
              className={`rounded-md py-1.5 text-sm font-bold capitalize transition ${
                side === s ? (s === "buy" ? "bg-pump text-pump-ink" : "bg-rug text-rug-ink") : "text-muted hover:text-text"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div>
        <div className="mb-1 flex justify-between text-xs text-muted">
          <label htmlFor={`amount-${tokenId}`}>Amount ({unit})</label>
          <span>
            {side === "buy" ? `Balance ${formatSol(balance)} SOL` : `Holding ${formatTokens(held)}`}
          </span>
        </div>
        <div
          className={`flex items-center rounded-lg border border-line bg-bg px-3 ${
            side === "buy" ? "focus-within:border-pump/60" : "focus-within:border-rug/60"
          }`}
        >
          <input
            id={`amount-${tokenId}`}
            inputMode="decimal"
            autoFocus={autoFocus}
            autoComplete="off"
            value={input}
            onChange={(e) => {
              clearError();
              setInput(e.target.value.replace(/[^0-9.]/g, ""));
            }}
            placeholder="0.0"
            className="w-full bg-transparent py-2.5 font-mono text-lg outline-none placeholder:text-muted/40"
          />
          <span className="text-sm text-muted">{unit}</span>
        </div>
      </div>

      <div className="flex gap-1.5">
        {side === "buy"
          ? [
              ...BUY_PRESETS.map((sol) => ({ label: `${sol} SOL`, value: sol })),
              { label: "Max", value: Math.floor(balance * 1e6) / 1e6 },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setAmount(p.value)}
                className="flex-1 rounded-md bg-panel-2 py-1 text-xs text-muted transition hover:text-text"
              >
                {p.label}
              </button>
            ))
          : SELL_PRESETS.map((pct) => (
              <button
                key={pct}
                type="button"
                disabled={held <= 0}
                onClick={() => setAmount(pct === 1 ? held : held * pct)}
                className="flex-1 rounded-md bg-panel-2 py-1 text-xs text-muted transition hover:text-text disabled:opacity-40"
              >
                {pct * 100}%
              </button>
            ))}
      </div>

      <dl className="space-y-1 rounded-lg bg-bg p-3 text-xs">
        <div className="flex justify-between">
          <dt className="text-muted">You get</dt>
          <dd className="font-mono font-semibold">
            {quote
              ? side === "buy"
                ? `≈ ${formatTokens(quote.tokenAmount)} $${ticker}`
                : `≈ ${formatSol(quote.solAmount)} SOL`
              : "—"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Price impact</dt>
          <dd className={`font-mono ${Math.abs(impact) > 0.05 ? "text-rug" : ""}`}>{quote ? formatPct(impact) : "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Fee (1%)</dt>
          <dd className="font-mono">{quote ? `${formatSol(quote.feeSol)} SOL` : "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Max slippage</dt>
          <dd className="font-mono">{DEFAULT_SLIPPAGE_BPS / 100}%</dd>
        </div>
      </dl>

      {(error ?? problem) && <p className="text-sm text-rug">{error ?? problem}</p>}

      <button
        type="submit"
        disabled={!quote || Boolean(problem) || pending}
        className={`w-full rounded-lg py-2.5 font-bold transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-panel-2 disabled:text-muted disabled:hover:brightness-100 ${
          side === "buy" ? "bg-pump text-pump-ink focus-visible:outline-pump" : "bg-rug text-rug-ink focus-visible:outline-rug"
        }`}
      >
        {pending ? "Sending…" : side === "buy" ? `Buy $${ticker}` : `Sell $${ticker}`}
      </button>
    </form>
  );
}

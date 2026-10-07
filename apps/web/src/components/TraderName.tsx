import type { TradeEvent } from "@ruggedfun/shared";

/** Trader handle with a badge for real players and token creators. Bots stay unlabeled. */
export function TraderName({ trade, me }: { trade: Pick<TradeEvent, "trader" | "isBot" | "isDev">; me?: string }) {
  const isMe = !trade.isBot && trade.trader === me;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className={`truncate ${isMe ? "font-semibold text-pump" : ""}`}>{isMe ? "you" : trade.trader}</span>
      {trade.isDev && <span className="shrink-0 rounded bg-amber-400/15 px-1 text-[10px] font-bold text-amber-300">DEV</span>}
      {!trade.isBot && !isMe && (
        <span className="shrink-0 rounded bg-sky-400/15 px-1 text-[10px] font-bold text-sky-300">PLAYER</span>
      )}
    </span>
  );
}

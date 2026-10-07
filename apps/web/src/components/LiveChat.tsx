"use client";

import type { MarketToken, TradeEvent } from "@ruggedfun/shared";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatSol, formatUsd } from "@/lib/format";
import { useMarket } from "@/lib/marketStore";

/**
 * A simulated token chat. Messages are generated in the browser from what the token is actually
 * doing (pumping, dumping, rugged, big trades), mostly "said" by its recent traders. Your own
 * messages only show for you.
 */

type Mood = "hype" | "fear" | "neutral" | "rugged" | "graduated" | "dead";

const LINES: Record<Mood, string[]> = {
  hype: [
    "LFG 🚀🚀",
    "send it",
    "this is going to $1M easy",
    "dev is based fr",
    "just aped more",
    "chart looks so clean",
    "we're so early",
    "${T} to the moon 🌕",
    "holding till 100x",
    "who else is in?",
    "green candles only",
    "told you all at {MC}",
  ],
  fear: [
    "who's dumping??",
    "dev sold?",
    "this is cooked",
    "paper hands everywhere smh",
    "buy the dip?",
    "not selling, diamond hands 💎",
    "pain",
    "it's just a shakeout",
    "why is it bleeding",
    "someone save ${T}",
  ],
  neutral: [
    "gm",
    "what's the play here",
    "chart crabbing",
    "any alpha?",
    "${T} community strong",
    "volume picking up",
    "how many holders now?",
    "waiting for a breakout",
    "anyone know the dev?",
    "{MC} is cheap ngl",
  ],
  rugged: [
    "RUGGED 💀",
    "dev pulled liquidity wtf",
    "never trusting a dev again",
    "gg",
    "rip my bags",
    "called it",
    "is it over?",
    "${T} was a scam",
  ],
  graduated: ["WE GRADUATED 🎓", "${T} made it!!", "told you so", "still early", "next stop: the moon"],
  dead: ["anyone still here?", "it's so quiet", "f", "${T} is dead", "hello?"],
};

const REPLIES = ["@you based", "@you ser...", "@you agreed", "@you ngmi 😂", "@you lfg", "@you what's your bag"];
const CHATTERS = [
  "anon",
  "degen42",
  "sol_maxi",
  "pumpooor",
  "xX_ape_Xx",
  "moonboi",
  "chartwatcher",
  "gm_fren",
  "wagmi_king",
  "bagholder99",
  "solsniper",
  "rektangle",
  "diamondhandz",
  "ape_together",
  "lowcapgems",
];
const MAX_MESSAGES = 80;

interface Message {
  id: number;
  author: string;
  text: string;
  mine?: boolean;
}

function moodOf(token: MarketToken | undefined): Mood {
  if (!token || token.endedAt !== null) return token?.status === "rugged" ? "rugged" : "dead";
  if (token.status === "rugged") return "rugged";
  if (token.status === "graduated" && Math.random() < 0.4) return "graduated";
  if (token.change5m > 0.08) return "hype";
  if (token.change5m < -0.08) return "fear";
  return Math.random() < 0.5 ? "neutral" : token.change5m >= 0 ? "hype" : "fear";
}

const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

/** Deterministic hue per handle for the avatar bubble. */
function hue(handle: string): number {
  let h = 0;
  for (const c of handle) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function LiveChat({ tokenId, ticker, username }: { tokenId: string; ticker: string; username?: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  // Random, so it's set after mount (server and browser renders must match).
  const [online, setOnline] = useState<number | null>(null);
  const nextId = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const say = (author: string, text: string, mine = false) =>
    setMessages((m) => [...m, { id: nextId.current++, author, text, mine }].slice(-MAX_MESSAGES));

  // Ambient chatter, in the token's mood, from its recent traders.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const fill = (line: string, token: MarketToken | undefined) =>
      line.replaceAll("${T}", `$${ticker}`).replaceAll("{MC}", token ? formatUsd(token.marketCap) : "this mc");
    const loop = () => {
      const { tokens, trades } = useMarket.getState();
      const token = tokens[tokenId];
      // Mostly the token's own recent traders, mixed with regulars so it's not one voice.
      const traders = [...new Set(trades.filter((t) => t.tokenId === tokenId && t.isBot).map((t) => t.trader))];
      const author = traders.length > 0 && Math.random() < 0.65 ? pick(traders) : pick(CHATTERS);
      const mood = moodOf(token);
      say(author, fill(pick(LINES[mood]), token));
      setOnline((n) => Math.max(5, (n ?? 20 + Math.floor(Math.random() * 60)) + Math.round((Math.random() - 0.5) * 6)));
      const quiet = mood === "dead" || mood === "rugged";
      timer = setTimeout(loop, (quiet ? 6000 : 2500) + Math.random() * 4000);
    };
    timer = setTimeout(loop, 800);
    return () => clearTimeout(timer);
  }, [tokenId, ticker]);

  // React to big trades on this token.
  useEffect(() => {
    let seen = new Set(useMarket.getState().trades.map((t) => t.id));
    return useMarket.subscribe((state) => {
      const fresh: TradeEvent[] = state.trades.filter((t) => t.tokenId === tokenId && !seen.has(t.id));
      seen = new Set(state.trades.map((t) => t.id));
      for (const t of fresh) {
        if (t.solAmount < 2 || Math.random() < 0.4) continue;
        const who = !t.isBot && t.trader === username ? "you" : t.trader;
        const text =
          t.side === "buy"
            ? `${who} just aped ${formatSol(t.solAmount)} SOL 👀`
            : t.isDev
              ? `DEV JUST DUMPED ${formatSol(t.solAmount)} SOL 🚨`
              : `${who} dumped ${formatSol(t.solAmount)} SOL wtf`;
        say(pick(CHATTERS), text);
      }
    });
  }, [tokenId, username]);

  // Stay pinned to the newest message unless the reader scrolled up.
  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    say(username ?? "you", text.slice(0, 200), true);
    setDraft("");
    stickToBottom.current = true;
    if (Math.random() < 0.6) {
      setTimeout(() => say(pick(CHATTERS), pick(REPLIES)), 1200 + Math.random() * 2500);
    }
  }

  return (
    <section aria-label="Live chat" className="flex h-[440px] flex-col rounded-xl border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="font-semibold">💬 Live chat</h2>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-pump" />
          {online === null ? "…" : `${online} online`}
        </span>
      </div>

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="flex-1 space-y-2 overflow-y-auto px-4 py-3 text-sm"
        aria-live="off"
      >
        {messages.length === 0 && <p className="text-center text-xs text-muted">Joining chat…</p>}
        {messages.map((m) => (
          <div key={m.id} className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold uppercase text-black"
              style={{ backgroundColor: m.mine ? "var(--color-pump)" : `hsl(${hue(m.author)} 70% 65%)` }}
            >
              {m.author.replace(/[^a-z0-9]/gi, "").slice(0, 1) || "?"}
            </span>
            <p className="min-w-0 break-words">
              <span className={`mr-1.5 font-semibold ${m.mine ? "text-pump" : "text-muted"}`}>{m.author}</span>
              {m.text}
            </p>
          </div>
        ))}
      </div>

      <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={200}
          placeholder={`Say something about $${ticker}`}
          aria-label="Chat message"
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-pump/50"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded-lg bg-pump px-3 text-sm font-bold text-black disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </section>
  );
}

/**
 * End-to-end trading check against running engine + web servers.
 * Signs up a throwaway user, buys and sells a live token, and checks the error paths.
 *
 *   npm run e2e:trading -w @ruggedfun/engine
 */
import type { ClientToServerEvents, MarketToken, ServerToClientEvents, TradeEvent, TradeResult } from "@ruggedfun/shared";
import { quoteTrade, spotPrice, type TradeSide } from "@ruggedfun/sim";
import { io, type Socket } from "socket.io-client";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const ENGINE = process.env.ENGINE_URL ?? "http://localhost:3001";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(ENGINE, { transports: ["websocket"] });
const tokens = new Map<string, MarketToken>();
const seenTrades: TradeEvent[] = [];
socket.on("token:tick", (ticks) => {
  for (const t of ticks) {
    const token = tokens.get(t.id);
    if (token) tokens.set(t.id, { ...token, ...t });
  }
});
socket.on("trade", (t) => {
  seenTrades.push(t);
  const token = tokens.get(t.tokenId);
  if (token) tokens.set(t.tokenId, { ...token, curve: t.curve, price: t.priceAfter });
});
await new Promise<void>((resolve) =>
  socket.once("snapshot", ({ tokens: list }) => {
    for (const t of list) tokens.set(t.id, t);
    resolve();
  }),
);

const username = `e2e_${Math.random().toString(36).slice(2, 8)}`;
// A random client IP, so repeated runs don't hit the 5-signups-per-hour limit.
const fakeIp = `10.${[0, 0, 0].map(() => Math.floor(Math.random() * 250)).join(".")}`;
const signup = await fetch(`${WEB}/api/users`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": fakeIp },
  body: JSON.stringify({ username }),
});
const cookie = signup.headers.get("set-cookie")?.split(";")[0] ?? "";
check("sign up", signup.status === 201, username);

async function trade(tokenId: string, side: TradeSide, amount: number, expectedPrice?: number, withCookie = true) {
  const token = tokens.get(tokenId)!;
  let quote: ReturnType<typeof quoteTrade> | null = null;
  try {
    quote = quoteTrade(token.curve, token.price / spotPrice(token.curve), side, amount);
  } catch {
    // Unquotable (e.g. selling more than anyone holds): send it anyway and let the server refuse it.
  }
  const res = await fetch(`${WEB}/api/trade`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(withCookie ? { cookie } : {}) },
    body: JSON.stringify({ tokenId, side, amount, expectedPrice: expectedPrice ?? quote?.avgPrice ?? token.price }),
  });
  return { status: res.status, body: (await res.json()) as TradeResult & { error?: string }, quote };
}

const live = [...tokens.values()].filter((t) => t.status === "live").sort((a, b) => b.marketCap - a.marketCap);
const target = live[0]!;
console.log(`trading $${target.ticker} (mcap ${target.marketCap.toFixed(1)} SOL)`);

const buy = await trade(target.id, "buy", 1);
check("buy 1 SOL", buy.status === 200, buy.body.error ?? `got ${buy.body.trade?.tokenAmount.toFixed(0)} tokens`);
check("balance is 9 SOL", Math.abs(buy.body.solBalance - 9) < 1e-9, String(buy.body.solBalance));
check(
  "fill matches the browser quote (±2% for the price moving)",
  Math.abs(buy.body.trade.tokenAmount / buy.quote!.tokenAmount - 1) < 0.02,
);
check("position opened", (buy.body.position?.tokenAmount ?? 0) > 0);

await new Promise((r) => setTimeout(r, 300));
check("trade broadcast to clients", seenTrades.some((t) => t.trader === username && t.side === "buy"));

const me = (await (await fetch(`${WEB}/api/me`, { headers: { cookie } })).json()) as { positions: unknown[] };
check("/api/me lists the position", me.positions.length === 1);

const held = buy.body.position!.tokenAmount;
const sell = await trade(target.id, "sell", held);
check(
  "sell records realized PnL",
  typeof sell.body.trade?.realizedPnlSol === "number" &&
    Math.abs(sell.body.trade.realizedPnlSol - (sell.body.trade.solAmount - 1)) < 1e-9,
  String(sell.body.trade?.realizedPnlSol),
);
check("sell everything", sell.status === 200, sell.body.error ?? `got ${sell.body.trade?.solAmount.toFixed(4)} SOL`);
check("position closed", sell.body.position === null);
check(
  "round trip lost a little (fees + price drift)",
  sell.body.solBalance > 8.5 && sell.body.solBalance < 10.5,
  `balance ${sell.body.solBalance.toFixed(4)}`,
);

const broke = await trade(target.id, "buy", 50);
check("can't buy more than balance", broke.status === 409 && /Not enough SOL/.test(broke.body.error ?? ""), broke.body.error);

const nothing = await trade(target.id, "sell", 1000);
check("can't sell what you don't hold", nothing.status === 409, nothing.body.error);

const slipped = await trade(target.id, "buy", 0.1, target.price / 100);
check("slippage protection", slipped.status === 409 && /slippage/.test(slipped.body.error ?? ""), slipped.body.error);

const anon = await trade(target.id, "buy", 0.1, undefined, false);
check("needs a session", anon.status === 401, anon.body.error);

const direct = await fetch(`${ENGINE}/internal/trade`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-engine-secret": "wrong" },
  body: "{}",
});
check("engine rejects a wrong secret", direct.status === 401);

const rugged = [...tokens.values()].find((t) => t.status === "rugged" && t.endedAt === null);
if (rugged) {
  const res = await fetch(`${WEB}/api/trade`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ tokenId: rugged.id, side: "buy", amount: 0.1, expectedPrice: rugged.price }),
  });
  check("can't buy a rugged token", res.status === 409, ((await res.json()) as { error: string }).error);
} else {
  console.log("⏭  no rugged token in its afterlife right now; skipped rugged-buy check");
}

// Rankings are cached for 30s, so only check that the user shows up once the cache can refresh.
await new Promise((r) => setTimeout(r, 31_000));
const board = (await (await fetch(`${WEB}/api/leaderboard?tab=all`)).json()) as { rows: { username: string; pnlSol: number }[] };
const mine = board.rows.find((r) => r.username === username);
check("on the all-time leaderboard", Boolean(mine), mine ? `pnl ${mine.pnlSol.toFixed(4)} SOL` : "missing");

console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`} (user ${username})`);
socket.close();
process.exit(failures === 0 ? 0 : 1);

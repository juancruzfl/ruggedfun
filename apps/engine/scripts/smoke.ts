/**
 * Connects to a running engine and reports what it receives.
 *
 *   npm run smoke -w @ruggedfun/engine -- [seconds]
 */
import type { ClientToServerEvents, ServerToClientEvents } from "@ruggedfun/shared";
import { io, type Socket } from "socket.io-client";

const url = process.env.ENGINE_URL ?? `http://localhost:${process.env.ENGINE_PORT ?? 3001}`;
const seconds = Number(process.argv[2] ?? 15);
const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(url);

const counts = { tickBatches: 0, priceUpdates: 0, candles: 0, launched: 0, status: 0, callouts: 0 };
let watching = "";

socket.on("connect_error", (err) => {
  console.error(`could not connect to ${url}: ${err.message}`);
  process.exit(1);
});
socket.on("snapshot", ({ tokens, callouts }) => {
  console.log(`snapshot: ${tokens.length} live tokens, ${callouts.length} recent callouts`);
  const top = [...tokens].sort((a, b) => b.marketCap - a.marketCap)[0];
  if (top) {
    watching = top.ticker;
    console.log(`subscribing to $${top.ticker} (mcap ${top.marketCap.toFixed(1)} SOL)`);
    socket.emit("token:subscribe", top.id);
  }
  const leaked = tokens.some((t) => "seed" in t || "fate" in t);
  console.log(leaked ? "❌ snapshot leaks seed/fate" : "✅ no seed/fate in snapshot");
});
socket.on("token:tick", (ticks) => {
  counts.tickBatches++;
  counts.priceUpdates += ticks.length;
});
socket.on("token:candle", () => counts.candles++);
socket.on("token:launched", (t) => {
  counts.launched++;
  console.log(`launched $${t.ticker} — ${t.name}`);
});
socket.on("token:status", (s) => {
  counts.status++;
  console.log(`status ${s.id.slice(0, 8)} → ${s.status}`);
});
socket.on("callout", (c) => {
  counts.callouts++;
  console.log(`callout: ${c.text}`);
});

setTimeout(() => {
  console.log(`\nafter ${seconds}s (watching $${watching}):`, counts);
  socket.close();
  process.exit(counts.tickBatches > 0 ? 0 : 1);
}, seconds * 1000);

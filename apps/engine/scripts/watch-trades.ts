/** Counts bot vs player trades and callouts from a running engine for N seconds. */
import type { ClientToServerEvents, ServerToClientEvents } from "@ruggedfun/shared";
import { io, type Socket } from "socket.io-client";
const seconds = Number(process.argv[2] ?? 20);
const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(process.env.ENGINE_URL ?? "http://localhost:3001");
let bot = 0, dev = 0, buys = 0, sol = 0, max = 0;
const callouts: string[] = [];
const curveChanged: string[] = [];
const curves = new Map<string, string>();
socket.on("snapshot", ({ tokens }) => tokens.forEach((t) => curves.set(t.id, JSON.stringify(t.curve))));
socket.on("trade", (t) => {
  if (t.isBot) bot++;
  if (t.isDev) dev++;
  if (t.side === "buy") buys++;
  sol += t.solAmount;
  max = Math.max(max, t.solAmount);
  const before = curves.get(t.tokenId);
  if (t.isBot && before && before !== JSON.stringify(t.curve)) curveChanged.push(t.ticker);
});
socket.on("callout", (c) => callouts.push(c.text));
setTimeout(() => {
  const total = bot;
  console.log(`${total} bot trades in ${seconds}s = ${(total / seconds).toFixed(1)}/s, ${dev} dev, ${((buys / total) * 100).toFixed(0)}% buys`);
  console.log(`volume ${sol.toFixed(1)} SOL, avg ${(sol / total).toFixed(2)}, max ${max.toFixed(1)} SOL`);
  console.log(`bot trades that changed a curve: ${curveChanged.length}`);
  console.log(`callouts:`, callouts.slice(0, 6));
  process.exit(0);
}, seconds * 1000);

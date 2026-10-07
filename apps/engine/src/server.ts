import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ClientToServerEvents, ServerToClientEvents } from "@ruggedfun/shared";
import { Server } from "socket.io";
import { TradeError, type Market, type MarketEvents } from "./market";
import { parseTradeRequest, type Trading } from "./trading";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const roomFor = (tokenId: string) => `token:${tokenId}`;
const MAX_BODY_BYTES = 10_000;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function secretMatches(given: string | undefined, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new TradeError("Request too large", 413);
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new TradeError("Invalid JSON");
  }
}

/**
 * HTTP + Socket.io server. Create it first, build the Market with `events`, then `attach`
 * the market and trading. `/internal/*` is for the web app only and needs the shared secret.
 */
export function createRealtimeServer(webOrigin: string, engineSecret: string) {
  let market: Market | null = null;
  let trading: Trading | null = null;

  const httpServer = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, { ok: true, liveTokens: market?.size ?? 0 });
      return;
    }
    if (req.method === "POST" && req.url === "/internal/trade") {
      if (!secretMatches(req.headers["x-engine-secret"] as string | undefined, engineSecret)) {
        sendJson(res, 401, { error: "Unauthorized" });
        return;
      }
      if (!trading) {
        sendJson(res, 503, { error: "Market is starting up" });
        return;
      }
      try {
        sendJson(res, 200, await trading.execute(parseTradeRequest(await readJson(req))));
      } catch (err) {
        if (err instanceof TradeError) {
          sendJson(res, err.status, { error: err.message });
        } else {
          console.error("trade failed", err);
          sendJson(res, 500, { error: "Trade failed" });
        }
      }
      return;
    }
    res.writeHead(404).end();
  });

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: webOrigin },
  });

  const events: MarketEvents = {
    launched: (token) => io.emit("token:launched", token),
    ticks: (ticks) => io.emit("token:tick", ticks),
    status: (change) => io.emit("token:status", change),
    callout: (callout) => io.emit("callout", callout),
    trade: (trade) => io.emit("trade", trade),
    candle: (candle) => io.to(roomFor(candle.tokenId)).emit("token:candle", candle),
    wantsCandles: (tokenId) => (io.sockets.adapter.rooms.get(roomFor(tokenId))?.size ?? 0) > 0,
  };

  function attach(m: Market, t: Trading): void {
    market = m;
    trading = t;
    io.on("connection", (socket) => {
      socket.emit("snapshot", m.snapshot());
      socket.on("token:subscribe", (tokenId) => {
        if (typeof tokenId === "string" && UUID.test(tokenId)) void socket.join(roomFor(tokenId));
      });
      socket.on("token:unsubscribe", (tokenId) => {
        if (typeof tokenId === "string") void socket.leave(roomFor(tokenId));
      });
    });
  }

  return { httpServer, io, events, attach };
}

"use client";

import type { ClientToServerEvents, ServerToClientEvents } from "@ruggedfun/shared";
import { io, type Socket } from "socket.io-client";

const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL ?? "http://localhost:3001";

export type MarketSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: MarketSocket | null = null;

/** One connection to the market engine per tab, shared by every component. */
export function getSocket(): MarketSocket {
  socket ??= io(ENGINE_URL, { transports: ["websocket"] });
  return socket;
}

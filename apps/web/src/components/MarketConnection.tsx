"use client";

import { SPARKLINE_SAMPLE_SECONDS } from "@ruggedfun/shared";
import { useEffect } from "react";
import { useMarket } from "@/lib/marketStore";
import { getSocket } from "@/lib/socket";

/** Feeds the engine's market events into the market store. Renders nothing. */
export function MarketConnection() {
  useEffect(() => {
    const market = useMarket.getState();
    const socket = getSocket();
    const handlers = {
      connect: () => market.setConnected(true),
      disconnect: () => market.setConnected(false),
    };

    if (socket.connected) market.setConnected(true);
    socket.on("connect", handlers.connect);
    socket.on("disconnect", handlers.disconnect);
    socket.on("snapshot", market.applySnapshot);
    socket.on("token:launched", market.addToken);
    socket.on("token:tick", market.applyTicks);
    socket.on("token:status", market.applyStatus);
    socket.on("callout", market.addCallout);
    socket.on("trade", market.applyTrade);

    const sampler = setInterval(() => useMarket.getState().sampleSparklines(), SPARKLINE_SAMPLE_SECONDS * 1000);
    return () => {
      clearInterval(sampler);
      socket.off("connect", handlers.connect);
      socket.off("disconnect", handlers.disconnect);
      socket.off("snapshot", market.applySnapshot);
      socket.off("token:launched", market.addToken);
      socket.off("token:tick", market.applyTicks);
      socket.off("token:status", market.applyStatus);
      socket.off("callout", market.addCallout);
      socket.off("trade", market.applyTrade);
    };
  }, []);

  return null;
}

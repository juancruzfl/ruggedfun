"use client";

import { SOL_USD, type Candle } from "@ruggedfun/shared";
import { CURVE } from "@ruggedfun/sim";
import {
  CandlestickSeries,
  createChart,
  HistogramSeries,
  PriceScaleMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import { formatUsd } from "@/lib/format";
import { useMarket } from "@/lib/marketStore";
import { getSocket } from "@/lib/socket";

export type ChartInterval = 1 | 5 | 60;

type RawCandle = Pick<Candle, "time" | "open" | "high" | "low" | "close" | "volume">;

const UP = "#4ade80";
const DOWN = "#f43f5e";
// globals.css tokens in hex (the chart draws on a canvas and can't read CSS variables). Keep in sync.
const MUTED = "#95a29c";
const PANEL_2 = "#19201d";
const LINE = "#252e2a";

/** Price per token (SOL) → market cap in USD, which is what launchpad charts show. */
const toMcapUsd = (price: number) => price * CURVE.totalSupply * SOL_USD;

function toBar(c: RawCandle) {
  return {
    time: c.time as UTCTimestamp,
    open: toMcapUsd(c.open),
    high: toMcapUsd(c.high),
    low: toMcapUsd(c.low),
    close: toMcapUsd(c.close),
  };
}

function toVolume(c: RawCandle) {
  return {
    time: c.time as UTCTimestamp,
    value: c.volume,
    color: c.close >= c.open ? `${UP}66` : `${DOWN}66`,
  };
}

const localTime = (t: number, seconds: boolean) =>
  new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: seconds ? "2-digit" : undefined });

/**
 * Market-cap candlesticks (log scale, so rugs read as cliffs) with volume underneath.
 * 5s and 1m load history from the database, then follow live candles from the engine.
 * 1s isn't stored, so it's built in the browser from live ticks starting now.
 */
export function PriceChart({ tokenId, interval }: { tokenId: string; interval: ChartInterval }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const barsRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  useEffect(() => {
    const chart = createChart(containerRef.current!, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: MUTED, attributionLogo: false },
      grid: { vertLines: { color: PANEL_2 }, horzLines: { color: PANEL_2 } },
      rightPriceScale: { borderColor: LINE, mode: PriceScaleMode.Logarithmic },
      timeScale: {
        borderColor: LINE,
        timeVisible: true,
        secondsVisible: true,
        tickMarkFormatter: (t: number) => localTime(t, false),
      },
      localization: { timeFormatter: (t: number) => localTime(t, true), priceFormatter: (p: number) => formatUsd(p / SOL_USD) },
      crosshair: { mode: 0 },
    });
    barsRef.current = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      borderVisible: false,
      priceFormat: { type: "custom", formatter: (p: number) => formatUsd(p / SOL_USD), minMove: 0.01 },
    });
    volumeRef.current = chart.addSeries(HistogramSeries, {
      priceScaleId: "",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const bars = barsRef.current!;
    const volume = volumeRef.current!;
    bars.setData([]);
    volume.setData([]);
    let lastTime = 0;
    const apply = (c: RawCandle) => {
      if (c.time < lastTime) return;
      lastTime = c.time;
      bars.update(toBar(c));
      volume.update(toVolume(c));
    };

    if (interval === 1) {
      // Build 1s candles from live price ticks.
      let current: RawCandle | null = null;
      return useMarket.subscribe((state, prev) => {
        const price = state.tokens[tokenId]?.price;
        if (price === undefined || price === prev.tokens[tokenId]?.price) return;
        const time = Math.floor(Date.now() / 1000);
        current =
          current && current.time === time
            ? { ...current, high: Math.max(current.high, price), low: Math.min(current.low, price), close: price }
            : { time, open: current?.close ?? price, high: price, low: price, close: price, volume: 0 };
        apply(current);
      });
    }

    // History from the database; live candles that arrive meanwhile wait in `pending`.
    let loaded = false;
    let cancelled = false;
    const pending: RawCandle[] = [];
    const onCandle = (c: Candle) => {
      if (c.tokenId !== tokenId || c.interval !== interval) return;
      if (loaded) apply(c);
      else pending.push(c);
    };
    const socket = getSocket();
    socket.on("token:candle", onCandle);

    fetch(`/api/tokens/${tokenId}/candles?interval=${interval}`)
      .then((res) => (res.ok ? (res.json() as Promise<RawCandle[]>) : []))
      .catch(() => [] as RawCandle[])
      .then((history) => {
        if (cancelled) return;
        bars.setData(history.map(toBar));
        volume.setData(history.map(toVolume));
        lastTime = history.at(-1)?.time ?? 0;
        loaded = true;
        pending.forEach(apply);
        chartRef.current?.timeScale().scrollToRealTime();
      });

    return () => {
      cancelled = true;
      socket.off("token:candle", onCandle);
    };
  }, [tokenId, interval]);

  return <div ref={containerRef} className="h-full w-full" />;
}

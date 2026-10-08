"use client";

import { ALERT_STEP, evaluateAlert, type AlertState } from "@ruggedfun/shared";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { formatSol } from "@/lib/format";
import { useMarket } from "@/lib/marketStore";
import { positionValue } from "@/lib/positionValue";
import { alertHeadline, signedSol, useNotifications, type PositionAlert } from "@/lib/notifications";
import { useQuickTrade } from "@/lib/quickTrade";
import { useTradeStatus } from "@/lib/tradeStatus";
import { sounds } from "@/lib/sound";
import { useSession } from "./SessionProvider";
import { TokenAvatar } from "./TokenBits";
import { NotificationStack, useStackExpanded, type StackItem } from "./NotificationStack";
import { tradeCardFrame, TradeStatusCard } from "./TradeStatusCard";

const VISIBLE_MS = 2500;

function showDesktopNotification(alert: PositionAlert) {
  if (!("Notification" in window) || Notification.permission !== "granted" || !document.hidden) return;
  try {
    const n = new Notification(alertHeadline(alert), {
      body: `${signedSol(alert.pnlSol, formatSol)} SOL · worth ${formatSol(alert.valueSol)} SOL`,
      icon: alert.imageUrl,
      tag: `position-${alert.tokenId}`,
    });
    n.onclick = () => {
      window.focus();
      window.location.assign(`/token/${alert.ticker}`);
    };
  } catch {
    // Some browsers only allow notifications from a service worker; the in-app card still shows.
  }
}

/**
 * Watches the player's open positions against live prices and alerts each new +5% step
 * (see evaluateAlert). Baselines keep updating while alerts are off, so turning them back on
 * doesn't dump a backlog.
 */
function usePositionAlertWatcher() {
  const { me } = useSession();
  const positions = useRef(me?.positions ?? []);
  positions.current = me?.positions ?? [];

  useEffect(() => {
    const states = new Map<string, AlertState>();

    const check = () => {
      const tokens = useMarket.getState().tokens;
      const now = Date.now();
      const held = new Set<string>();
      for (const p of positions.current) {
        held.add(p.tokenId);
        const token = tokens[p.tokenId];
        // Rugs get the full-screen moment instead of a drop alert.
        if (!token || token.endedAt !== null || token.status === "rugged" || p.costBasisSol <= 0) continue;
        const valueSol = positionValue(p.tokenAmount, token, p.lastPrice);
        const result = evaluateAlert(states.get(p.tokenId), p.costBasisSol, valueSol / p.costBasisSol - 1, now);
        states.set(p.tokenId, result.state);
        if (result.fire === null) continue;

        const notifications = useNotifications.getState();
        const rising = result.fire > 0;
        if (rising ? !notifications.enabled : !notifications.drops) continue;
        const alert = notifications.push({
          tokenId: p.tokenId,
          ticker: token.ticker,
          name: token.name,
          imageUrl: token.imageUrl,
          levelPct: Math.round(result.fire * ALERT_STEP * 100),
          pnlSol: valueSol - p.costBasisSol,
          valueSol,
          at: now,
        });
        if (rising) sounds.alert();
        else sounds.alertDown();
        if (notifications.desktop) showDesktopNotification(alert);
      }
      // Closed positions start fresh if they're reopened.
      for (const id of states.keys()) if (!held.has(id)) states.delete(id);
    };

    check();
    return useMarket.subscribe(check);
  }, []);
}

function AlertCard({ alert }: { alert: PositionAlert }) {
  const hide = useNotifications((s) => s.hide);
  const openTrade = useQuickTrade((s) => s.open);
  const paused = useStackExpanded();
  const up = alert.levelPct >= 0;

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => hide(alert.id), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [paused, hide, alert.id]);

  return (
    <div role="status" className="flex gap-3 p-3">
      <TokenAvatar src={alert.imageUrl} alt="" size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={`truncate text-sm font-semibold ${up ? "" : "text-text"}`}>
            ${alert.ticker} is {up ? "up" : "down"}{" "}
            <span className={up ? "text-pump" : "text-rug"}>
              {up ? "+" : "−"}
              {Math.abs(alert.levelPct)}%
            </span>{" "}
            {up ? "📈" : "📉"}
          </p>
          <button onClick={() => hide(alert.id)} aria-label="Dismiss" className="-mt-1 text-muted hover:text-text">
            ×
          </button>
        </div>
        <p className="font-mono text-xs text-muted">
          <span className={alert.pnlSol >= 0 ? "text-pump" : "text-rug"}>{signedSol(alert.pnlSol, formatSol)} SOL</span>{" "}
          · worth {formatSol(alert.valueSol)} SOL
        </p>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => {
              hide(alert.id);
              openTrade(alert.tokenId, "sell");
            }}
            className="rounded-md bg-rug px-2.5 py-1 text-xs font-bold text-black hover:brightness-110"
          >
            Sell
          </button>
          <Link
            href={`/token/${alert.ticker}`}
            onClick={() => hide(alert.id)}
            className="rounded-md bg-panel-2 px-2.5 py-1 text-xs font-semibold hover:bg-line"
          >
            View
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Position-alert watcher plus the notification stack in the top-right corner (your trades and alerts). */
export function PositionAlerts() {
  usePositionAlertWatcher();
  const load = useNotifications((s) => s.load);
  const visible = useNotifications((s) => s.visible);
  const history = useNotifications((s) => s.history);
  const trades = useTradeStatus((s) => s.trades);
  useEffect(() => load(), [load]);

  const cards = visible.map((id) => history.find((a) => a.id === id)).filter((a): a is PositionAlert => Boolean(a));

  const items: StackItem[] = [
    ...trades.map((trade) => ({
      key: `trade-${trade.id}`,
      at: trade.startedAt,
      frame: tradeCardFrame(trade),
      content: <TradeStatusCard trade={trade} />,
    })),
    ...cards.map((alert) => ({
      key: `alert-${alert.id}`,
      at: alert.at,
      frame: alert.levelPct >= 0 ? "border-pump/40" : "border-rug/50",
      content: <AlertCard alert={alert} />,
    })),
  ];
  return <NotificationStack items={items} />;
}

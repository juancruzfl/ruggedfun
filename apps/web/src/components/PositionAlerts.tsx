"use client";

import { ALERT_STEP, evaluateAlert, type AlertState } from "@ruggedfun/shared";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatSol } from "@/lib/format";
import { useMarket } from "@/lib/marketStore";
import { positionValue } from "@/lib/positionValue";
import { useNotifications, type PositionAlert } from "@/lib/notifications";
import { useQuickTrade } from "@/lib/quickTrade";
import { sounds } from "@/lib/sound";
import { useSession } from "./SessionProvider";
import { TokenAvatar } from "./TokenBits";

const VISIBLE_MS = 8000;

function showDesktopNotification(alert: PositionAlert) {
  if (!("Notification" in window) || Notification.permission !== "granted" || !document.hidden) return;
  try {
    const n = new Notification(`$${alert.ticker} is up ${alert.levelPct}% 📈`, {
      body: `+${formatSol(alert.pnlSol)} SOL · worth ${formatSol(alert.valueSol)} SOL`,
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
        if (!token || token.endedAt !== null || p.costBasisSol <= 0) continue;
        const valueSol = positionValue(p.tokenAmount, token, p.lastPrice);
        const result = evaluateAlert(states.get(p.tokenId), p.costBasisSol, valueSol / p.costBasisSol - 1, now);
        states.set(p.tokenId, result.state);
        if (result.fire === null) continue;

        const notifications = useNotifications.getState();
        if (!notifications.enabled) continue;
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
        sounds.alert();
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
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (hovered) return;
    const timer = setTimeout(() => hide(alert.id), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [hovered, hide, alert.id]);

  return (
    <div
      role="status"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="pointer-events-auto flex gap-3 rounded-xl border border-pump/40 bg-panel p-3 shadow-2xl shadow-black/60"
    >
      <TokenAvatar src={alert.imageUrl} alt="" size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-semibold">
            ${alert.ticker} is up <span className="text-pump">+{alert.levelPct}%</span> 📈
          </p>
          <button onClick={() => hide(alert.id)} aria-label="Dismiss" className="-mt-1 text-muted hover:text-text">
            ×
          </button>
        </div>
        <p className="font-mono text-xs text-muted">
          <span className="text-pump">+{formatSol(alert.pnlSol)} SOL</span> · worth {formatSol(alert.valueSol)} SOL
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

/** Position-alert watcher plus the stack of alert cards in the top-right corner. */
export function PositionAlerts() {
  usePositionAlertWatcher();
  const load = useNotifications((s) => s.load);
  const visible = useNotifications((s) => s.visible);
  const history = useNotifications((s) => s.history);
  useEffect(() => load(), [load]);

  const cards = visible.map((id) => history.find((a) => a.id === id)).filter((a): a is PositionAlert => Boolean(a));
  if (cards.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-16 z-[35] flex flex-col gap-2 sm:left-auto sm:w-80"
    >
      {cards.map((alert) => (
        <AlertCard key={alert.id} alert={alert} />
      ))}
    </div>
  );
}

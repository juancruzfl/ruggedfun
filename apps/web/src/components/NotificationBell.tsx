"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatSol, timeAgo } from "@/lib/format";
import { useNotifications } from "@/lib/notifications";
import { TokenAvatar } from "./TokenBits";

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 py-1.5">
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-pump" : "bg-line"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? "left-[1.125rem]" : "left-0.5"}`}
        />
      </button>
    </label>
  );
}

/** Bell with unread count, recent position alerts, and alert settings. */
export function NotificationBell() {
  const { history, enabled, desktop, setEnabled, setDesktop, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [desktopNote, setDesktopNote] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const unread = history.filter((a) => !a.read).length;

  useEffect(() => {
    if (!open) return;
    markAllRead();
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open, markAllRead, history.length]);

  async function toggleDesktop(on: boolean) {
    setDesktopNote(null);
    if (!on) return setDesktop(false);
    if (!("Notification" in window)) return setDesktopNote("This browser doesn't support notifications.");
    const permission =
      Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission === "granted") setDesktop(true);
    else setDesktopNote("Notifications are blocked for this site in your browser settings.");
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-panel hover:text-text"
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rug px-1 font-mono text-[10px] font-bold text-black">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-panel shadow-2xl shadow-black/60"
        >
          <div className="border-b border-line p-4">
            <h2 className="font-semibold">Notifications</h2>
            <div className="mt-2">
              <Toggle
                label="Position alerts"
                hint="Every +5% a position you hold climbs"
                checked={enabled}
                onChange={setEnabled}
              />
              <Toggle
                label="Desktop notifications"
                hint="Also alert when this tab is in the background"
                checked={desktop}
                onChange={toggleDesktop}
              />
              {desktopNote && <p className="mt-1 text-xs text-rug">{desktopNote}</p>}
            </div>
          </div>

          {history.length === 0 ? (
            <p className="p-4 text-sm text-muted">No alerts yet. Hold a token and we&apos;ll ping you every +5%.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {history.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/token/${a.ticker}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-panel-2"
                  >
                    <TokenAvatar src={a.imageUrl} alt="" size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">
                        ${a.ticker} up <span className="font-semibold text-pump">+{a.levelPct}%</span>
                      </div>
                      <div className="font-mono text-xs text-muted">+{formatSol(a.pnlSol)} SOL</div>
                    </div>
                    <span className="text-xs text-muted">{timeAgo(a.at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

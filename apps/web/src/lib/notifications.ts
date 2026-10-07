"use client";

import { create } from "zustand";

export interface PositionAlert {
  id: string;
  tokenId: string;
  ticker: string;
  name: string;
  imageUrl: string;
  /** Signed: 15 for "+15%", -10 for "−10%". */
  levelPct: number;
  pnlSol: number;
  valueSol: number;
  at: number;
  read: boolean;
}

const MAX_HISTORY = 30;
const SETTINGS_KEY = "rf:alerts";

interface Settings {
  /** Alerts when a position climbs (kept as `enabled` so earlier saved settings still apply). */
  enabled: boolean;
  /** Alerts when a position falls. */
  drops: boolean;
  /** Also show a system notification when the tab is in the background. */
  desktop: boolean;
}

const DEFAULT_SETTINGS: Settings = { enabled: true, drops: true, desktop: false };

function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // Storage blocked or corrupt: fall back to defaults.
  }
  return DEFAULT_SETTINGS;
}

function writeSettings(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // The setting just won't stick.
  }
}

const pickSettings = ({ enabled, drops, desktop }: Settings): Settings => ({ enabled, drops, desktop });

/** "$FROG is up +15% 📈" / "$FROG is down −10% 📉" */
export function alertHeadline(alert: Pick<PositionAlert, "ticker" | "levelPct">): string {
  return alert.levelPct >= 0
    ? `$${alert.ticker} is up +${alert.levelPct}% 📈`
    : `$${alert.ticker} is down −${Math.abs(alert.levelPct)}% 📉`;
}

/** Signed SOL with a real minus sign: "+0.150" / "−0.100". */
export function signedSol(sol: number, format: (n: number) => string): string {
  return `${sol >= 0 ? "+" : "−"}${format(Math.abs(sol))}`;
}

interface NotificationState extends Settings {
  loaded: boolean;
  /** Newest first. */
  history: PositionAlert[];
  /** Alerts currently shown as on-screen cards. */
  visible: string[];
  load(): void;
  push(alert: Omit<PositionAlert, "id" | "read">): PositionAlert;
  hide(id: string): void;
  markAllRead(): void;
  setEnabled(enabled: boolean): void;
  setDrops(drops: boolean): void;
  setDesktop(desktop: boolean): void;
}

export const useNotifications = create<NotificationState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,
  history: [],
  visible: [],
  load: () => set({ ...readSettings(), loaded: true }),
  push: (input) => {
    const alert: PositionAlert = { ...input, id: crypto.randomUUID(), read: false };
    set((s) => ({ history: [alert, ...s.history].slice(0, MAX_HISTORY), visible: [...s.visible, alert.id].slice(-3) }));
    return alert;
  },
  hide: (id) => set((s) => ({ visible: s.visible.filter((v) => v !== id) })),
  markAllRead: () => set((s) => ({ history: s.history.map((a) => (a.read ? a : { ...a, read: true })) })),
  setEnabled: (enabled) => {
    set({ enabled });
    writeSettings({ ...pickSettings(get()), enabled });
  },
  setDrops: (drops) => {
    set({ drops });
    writeSettings({ ...pickSettings(get()), drops });
  },
  setDesktop: (desktop) => {
    set({ desktop });
    writeSettings({ ...pickSettings(get()), desktop });
  },
}));

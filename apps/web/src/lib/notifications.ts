"use client";

import { create } from "zustand";

export interface PositionAlert {
  id: string;
  tokenId: string;
  ticker: string;
  name: string;
  imageUrl: string;
  /** e.g. 15 for "+15%". */
  levelPct: number;
  pnlSol: number;
  valueSol: number;
  at: number;
  read: boolean;
}

const MAX_HISTORY = 30;
const SETTINGS_KEY = "rf:alerts";

interface Settings {
  /** In-app position alerts. */
  enabled: boolean;
  /** Also show a system notification when the tab is in the background. */
  desktop: boolean;
}

function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { enabled: true, desktop: false, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // Storage blocked or corrupt: fall back to defaults.
  }
  return { enabled: true, desktop: false };
}

function writeSettings(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // The setting just won't stick.
  }
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
  setDesktop(desktop: boolean): void;
}

export const useNotifications = create<NotificationState>((set, get) => ({
  enabled: true,
  desktop: false,
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
    writeSettings({ enabled, desktop: get().desktop });
  },
  setDesktop: (desktop) => {
    set({ desktop });
    writeSettings({ enabled: get().enabled, desktop });
  },
}));

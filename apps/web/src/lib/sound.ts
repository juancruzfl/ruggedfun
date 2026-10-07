"use client";

import { create } from "zustand";

/**
 * Tiny synthesized sound effects (Web Audio, no files). Browsers only allow audio after the
 * page has had a click or key press, so the first sounds may be silent until then.
 */

const MUTE_KEY = "rf:muted";

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export const useSound = create<{ muted: boolean; loaded: boolean; load(): void; toggle(): void }>((set, get) => ({
  muted: false,
  loaded: false,
  load: () => set({ muted: readMuted(), loaded: true }),
  toggle: () => {
    const muted = !get().muted;
    set({ muted });
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      // Storage blocked: the setting just won't stick.
    }
  },
}));

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined" || useSound.getState().muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One note: frequency glide from `from` to `to` Hz, starting `at` seconds from now. */
function note(
  ac: AudioContext,
  { from, to = from, at = 0, length, type = "sine", volume = 0.15, vibrato = 0 }: {
    from: number;
    to?: number;
    at?: number;
    length: number;
    type?: OscillatorType;
    volume?: number;
    vibrato?: number;
  },
) {
  const start = ac.currentTime + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + length);
  if (vibrato > 0) {
    const lfo = ac.createOscillator();
    const depth = ac.createGain();
    lfo.frequency.value = 6;
    depth.gain.value = vibrato;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(start);
    lfo.stop(start + length);
  }
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + length + 0.05);
}

export const sounds = {
  buy() {
    const ac = audio();
    if (ac) note(ac, { from: 880, to: 1320, length: 0.09, volume: 0.08 });
  },
  sell() {
    const ac = audio();
    if (ac) note(ac, { from: 660, to: 440, length: 0.09, volume: 0.08 });
  },
  /** Sad trombone. */
  rug() {
    const ac = audio();
    if (!ac) return;
    const notes = [392, 370, 349];
    notes.forEach((f, i) => note(ac, { from: f, at: i * 0.38, length: 0.36, type: "sawtooth", volume: 0.07 }));
    note(ac, { from: 330, to: 311, at: notes.length * 0.38, length: 1.1, type: "sawtooth", volume: 0.07, vibrato: 8 });
  },
  /** Rising arpeggio and a sparkle. */
  moon() {
    const ac = audio();
    if (!ac) return;
    [523, 659, 784, 1047].forEach((f, i) => note(ac, { from: f, at: i * 0.09, length: 0.25, type: "triangle", volume: 0.12 }));
    note(ac, { from: 2093, to: 3136, at: 0.4, length: 0.3, volume: 0.05 });
  },
};

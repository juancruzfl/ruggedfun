/**
 * Position alerts fire each time a held position crosses a new 5% step over its average cost,
 * in either direction: a new high (+5%, +10%, …) or a new low (−5%, −10%, …).
 */
export const ALERT_STEP = 0.05;
/** At most one alert per token in this window; a bigger move in the meantime fires as one alert. */
export const ALERT_THROTTLE_MS = 10_000;

export interface AlertState {
  /** Cost basis the steps are measured against; a buy or partial sell changes it and resets the baseline. */
  costBasisSol: number;
  /** Highest step already alerted (or already reached when tracking began); never below 0. */
  highestSteps: number;
  /** Lowest step already alerted (or already reached when tracking began); never above 0. */
  lowestSteps: number;
  lastAlertAt: number;
}

/**
 * Whole steps reached, signed: +17% → 3 (+15%), −12% → −2 (−10%). Anything within one step of
 * break-even → 0.
 */
export function alertSteps(pnlPct: number, step = ALERT_STEP): number {
  if (!Number.isFinite(pnlPct)) return 0;
  const steps = pnlPct / step;
  // The epsilon keeps exact multiples (e.g. 0.15 / 0.05 = 2.9999…) from rounding toward zero.
  // `|| 0` turns Math.ceil's -0 (a small loss) into a plain 0.
  return (steps >= 0 ? Math.floor(steps + 1e-9) : Math.ceil(steps - 1e-9)) || 0;
}

/**
 * Decides whether a position update should fire an alert. Returns the new state and the signed
 * step to announce (3 → "+15%", −2 → "−10%"), or null. The first sighting and any cost-basis
 * change are silent: they set the baseline at whatever has already been reached. After that, only
 * a new high or a new low alerts, so wobbling back and forth over a level doesn't repeat it.
 */
export function evaluateAlert(
  state: AlertState | undefined,
  costBasisSol: number,
  pnlPct: number,
  now: number,
  options: { step?: number; throttleMs?: number } = {},
): { state: AlertState; fire: number | null } {
  const steps = alertSteps(pnlPct, options.step);
  if (!state || Math.abs(state.costBasisSol - costBasisSol) > 1e-9) {
    return {
      state: {
        costBasisSol,
        highestSteps: Math.max(0, steps),
        lowestSteps: Math.min(0, steps),
        lastAlertAt: state?.lastAlertAt ?? 0,
      },
      fire: null,
    };
  }
  if (now - state.lastAlertAt < (options.throttleMs ?? ALERT_THROTTLE_MS)) return { state, fire: null };
  if (steps > state.highestSteps) return { state: { ...state, highestSteps: steps, lastAlertAt: now }, fire: steps };
  if (steps < state.lowestSteps) return { state: { ...state, lowestSteps: steps, lastAlertAt: now }, fire: steps };
  return { state, fire: null };
}

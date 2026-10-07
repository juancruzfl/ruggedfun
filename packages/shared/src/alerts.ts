/** Position alerts fire each time a held position crosses a new +5% step over its average cost. */
export const ALERT_STEP = 0.05;
/** At most one alert per token in this window; a bigger jump in the meantime fires as one alert. */
export const ALERT_THROTTLE_MS = 10_000;

export interface AlertState {
  /** Cost basis the steps are measured against; a buy or partial sell changes it and resets the baseline. */
  costBasisSol: number;
  /** Highest step already alerted (or already reached when tracking began). */
  notifiedSteps: number;
  lastAlertAt: number;
}

/** Whole steps reached: +17% → 3 (15%). Below the first step (or negative) → 0. */
export function alertSteps(pnlPct: number, step = ALERT_STEP): number {
  if (!(pnlPct > 0)) return 0;
  // The epsilon keeps exact multiples (e.g. 0.15 / 0.05 = 2.9999…) from rounding down.
  return Math.floor(pnlPct / step + 1e-9);
}

/**
 * Decides whether a position update should fire an alert. Returns the new state and the step to
 * announce (e.g. 3 → "+15%"), or null. The first sighting and any cost-basis change are silent:
 * they set the baseline at whatever has already been reached.
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
    return { state: { costBasisSol, notifiedSteps: steps, lastAlertAt: state?.lastAlertAt ?? 0 }, fire: null };
  }
  const throttled = now - state.lastAlertAt < (options.throttleMs ?? ALERT_THROTTLE_MS);
  if (steps <= state.notifiedSteps || throttled) return { state, fire: null };
  return { state: { costBasisSol, notifiedSteps: steps, lastAlertAt: now }, fire: steps };
}

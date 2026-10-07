import type { Fate } from "./types";

/** Seconds per simulation tick. Prices update once per tick. */
export const TICK_SECONDS = 1;

/**
 * Probability of each fate at launch.
 * Starting point from public pump.fun stats: ~1% of launches graduate and the large majority show
 * rug / pump-and-dump behavior. Verify against current data before launch.
 */
export const FATE_WEIGHTS: Record<Fate, number> = {
  rug: 0.2,
  slow_death: 0.75,
  survive: 0.04,
  moon: 0.01,
};

type Range = readonly [min: number, max: number];

/** Shape of each fate's price path. Durations are in seconds, multiples relative to launch price. */
export const FATE_TUNING = {
  rug: {
    peakMultiple: [1.5, 8] as Range,
    pumpSeconds: [20, 600] as Range,
    /** How long the dev waits at the top before pulling liquidity. */
    holdSeconds: [5, 120] as Range,
    rugFloorMultiple: [0.005, 0.04] as Range,
    afterlifeSeconds: [60, 300] as Range,
    sigma: 0.03,
    deadSigma: 0.004,
  },
  slow_death: {
    peakMultiple: [1.1, 4] as Range,
    pumpSeconds: [15, 300] as Range,
    bleedSeconds: [600, 3 * 3600] as Range,
    finalMultiple: [0.01, 0.08] as Range,
    /** Dead-cat bounces on the way down. */
    bounces: [3, 7] as Range,
    sigma: 0.025,
    deadSigma: 0.006,
  },
  survive: {
    peakMultiple: [2, 8] as Range,
    pumpSeconds: [60, 900] as Range,
    lifespanSeconds: [2 * 3600, 8 * 3600] as Range,
    finalMultiple: [0.5, 2] as Range,
    swings: [6, 14] as Range,
    sigma: 0.02,
  },
  moon: {
    /** Peak is Pareto distributed: min `peakMin`, tail `peakAlpha`, capped at `peakMax`. */
    peakMin: 20,
    peakAlpha: 1.1,
    peakMax: 5000,
    climbSeconds: [600, 4 * 3600] as Range,
    climbWaves: [5, 12] as Range,
    fadeSeconds: [1800, 3 * 3600] as Range,
    /** Fraction of the peak the token holds on to by the end. */
    retrace: [0.3, 0.8] as Range,
    sigma: 0.03,
  },
};

/**
 * The house token wanders around a fixed multiple forever: a slow level (minutes to hours) plus
 * the usual fast noise. Level std ≈ levelSigma / sqrt(2 * levelReversion) ≈ 10%; with the noise and
 * jumps a day ranges about 5x–11x, well under graduation (~14.7x).
 */
export const HOUSE_TUNING = {
  multiple: 7,
  levelReversion: 0.0005,
  levelSigma: 0.003,
  sigma: 0.01,
};

/** Ornstein-Uhlenbeck pull of the noise back toward the target curve, per tick. Noise std ≈ sigma / sqrt(2 * reversion). */
export const NOISE_REVERSION = 0.02;
/** Chance per tick of a fat-tailed move (a whale buy or panic sell). */
export const JUMP_CHANCE = 0.01;
export const JUMP_SIZE_SIGMAS = 4;

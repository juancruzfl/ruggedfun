import { GRADUATION_MULTIPLE } from "./bondingCurve";
import { FATE_TUNING, FATE_WEIGHTS } from "./config";
import type { Rng } from "./rng";
import type { Fate, FatePlan, Keyframe } from "./types";

export function rollFate(rng: Rng, weights: Record<Fate, number> = FATE_WEIGHTS): Fate {
  const entries = Object.entries(weights) as [Fate, number][];
  let r = rng.next() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [fate, weight] of entries) {
    r -= weight;
    if (r < 0) return fate;
  }
  return entries[entries.length - 1]![0];
}

/**
 * Appends `count` keyframes moving from `from` to `to` (log space) between two ticks.
 * Intermediate points are jittered by `wobble` × the move size, which gives pumps their
 * pullbacks and dumps their dead-cat bounces. The last point lands exactly on `to`.
 */
function wave(
  keyframes: Keyframe[],
  rng: Rng,
  opts: { endTick: number; to: number; count: number; wobble: number; sigmaFrom: number; sigmaTo: number },
): void {
  const start = keyframes[keyframes.length - 1]!;
  const span = opts.endTick - start.tick;
  const move = Math.abs(opts.to - start.logMultiple);
  for (let i = 1; i <= opts.count; i++) {
    const f = i / opts.count;
    const last = i === opts.count;
    const prevTick = keyframes[keyframes.length - 1]!.tick;
    const tick = last ? opts.endTick : Math.round(start.tick + span * (f + rng.range(-0.3, 0.3) / opts.count));
    keyframes.push({
      tick: Math.max(prevTick + 1, tick),
      logMultiple: start.logMultiple + (opts.to - start.logMultiple) * f + (last ? 0 : rng.range(-1, 1) * opts.wobble * move),
      sigma: opts.sigmaFrom + (opts.sigmaTo - opts.sigmaFrom) * f,
    });
  }
}

export function buildPlan(fate: Fate, rng: Rng): FatePlan {
  switch (fate) {
    case "rug": {
      const t = FATE_TUNING.rug;
      const peak = rng.logRange(...t.peakMultiple);
      const keyframes: Keyframe[] = [{ tick: 0, logMultiple: 0, sigma: t.sigma }];
      wave(keyframes, rng, {
        endTick: rng.int(...t.pumpSeconds),
        to: Math.log(peak),
        count: rng.int(2, 5),
        wobble: 0.35,
        sigmaFrom: t.sigma,
        sigmaTo: t.sigma,
      });
      const rugTick = keyframes[keyframes.length - 1]!.tick + rng.int(...t.holdSeconds);
      const floor = Math.log(rng.logRange(...t.rugFloorMultiple));
      const endTick = rugTick + rng.int(...t.afterlifeSeconds);
      keyframes.push(
        { tick: rugTick, logMultiple: Math.log(peak) - rng.range(0, 0.3), sigma: t.sigma },
        // Same tick, lower value: the target jumps straight down.
        { tick: rugTick, logMultiple: floor, sigma: t.deadSigma },
        { tick: endTick, logMultiple: floor - rng.range(0, 1), sigma: t.deadSigma },
      );
      return { fate, endStatus: "rugged", endTick, keyframes, peakMultiple: peak, rugTick };
    }

    case "slow_death": {
      const t = FATE_TUNING.slow_death;
      const peak = rng.logRange(...t.peakMultiple);
      const keyframes: Keyframe[] = [{ tick: 0, logMultiple: 0, sigma: t.sigma }];
      wave(keyframes, rng, {
        endTick: rng.int(...t.pumpSeconds),
        to: Math.log(peak),
        count: rng.int(1, 3),
        wobble: 0.3,
        sigmaFrom: t.sigma,
        sigmaTo: t.sigma,
      });
      const endTick = keyframes[keyframes.length - 1]!.tick + rng.int(...t.bleedSeconds);
      wave(keyframes, rng, {
        endTick,
        to: Math.log(rng.logRange(...t.finalMultiple)),
        count: rng.int(...t.bounces),
        wobble: 0.15,
        sigmaFrom: t.sigma,
        sigmaTo: t.deadSigma,
      });
      return { fate, endStatus: "dead", endTick, keyframes, peakMultiple: peak };
    }

    case "survive": {
      const t = FATE_TUNING.survive;
      const peak = rng.logRange(...t.peakMultiple);
      const keyframes: Keyframe[] = [{ tick: 0, logMultiple: 0, sigma: t.sigma }];
      wave(keyframes, rng, {
        endTick: rng.int(...t.pumpSeconds),
        to: Math.log(peak),
        count: rng.int(2, 4),
        wobble: 0.3,
        sigmaFrom: t.sigma,
        sigmaTo: t.sigma,
      });
      const endTick = rng.int(...t.lifespanSeconds);
      wave(keyframes, rng, {
        endTick,
        to: Math.log(rng.logRange(...t.finalMultiple)),
        count: rng.int(...t.swings),
        wobble: 0.4,
        sigmaFrom: t.sigma,
        sigmaTo: t.sigma,
      });
      return { fate, endStatus: "dead", endTick, keyframes, peakMultiple: peak };
    }

    case "moon": {
      const t = FATE_TUNING.moon;
      const peak = Math.min(rng.pareto(t.peakMin, t.peakAlpha), t.peakMax);
      const keyframes: Keyframe[] = [{ tick: 0, logMultiple: 0, sigma: t.sigma }];
      wave(keyframes, rng, {
        endTick: rng.int(...t.climbSeconds),
        to: Math.log(peak),
        count: rng.int(...t.climbWaves),
        wobble: 0.08,
        sigmaFrom: t.sigma,
        sigmaTo: t.sigma,
      });
      const endTick = keyframes[keyframes.length - 1]!.tick + rng.int(...t.fadeSeconds);
      wave(keyframes, rng, {
        endTick,
        to: Math.log(peak * rng.range(...t.retrace)),
        count: rng.int(3, 6),
        wobble: 0.3,
        sigmaFrom: t.sigma,
        sigmaTo: t.sigma,
      });
      return { fate, endStatus: "graduated", endTick, keyframes, peakMultiple: peak };
    }
  }
}

/** Tokens that aren't mooning are held under this, so only moons graduate. */
export const MAX_NON_MOON_MULTIPLE = GRADUATION_MULTIPLE * 0.9;

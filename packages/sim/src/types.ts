/** Hidden outcome rolled at launch. Never sent to clients. */
export type Fate = "rug" | "slow_death" | "survive" | "moon";

/** The launchpad's own token ($RUGGEDFUN): never rolled, never ends. */
export type HouseFate = "house";

/** Every kind of price path the simulator runs. */
export type SimFate = Fate | HouseFate;

/** Status a token ends in once its simulation finishes. */
export type EndStatus = "rugged" | "dead" | "graduated";

/**
 * A point on a token's target price curve, as log(price / launch price).
 * `sigma` is the per-tick noise used on the segment that starts at this keyframe.
 */
export interface Keyframe {
  tick: number;
  logMultiple: number;
  sigma: number;
}

/** Everything decided about a token at launch. Derived deterministically from its seed. */
export interface FatePlan {
  fate: SimFate;
  endStatus: EndStatus;
  endTick: number;
  keyframes: Keyframe[];
  /** Target peak multiple of the launch price (the realized peak differs because of noise). */
  peakMultiple: number;
  /** Tick at which liquidity is pulled. Only set for rugs. */
  rugTick?: number;
}

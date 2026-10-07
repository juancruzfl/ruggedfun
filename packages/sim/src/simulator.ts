import { JUMP_CHANCE, JUMP_SIZE_SIGMAS, NOISE_REVERSION } from "./config";
import { buildPlan, MAX_NON_MOON_MULTIPLE, rollFate } from "./fate";
import { createRng, type Rng } from "./rng";
import type { Fate, FatePlan } from "./types";

export interface TokenSimOptions {
  /** Force a fate instead of rolling one (tests, tuning). */
  fate?: Fate;
}

const MAX_NON_MOON_LOG = Math.log(MAX_NON_MOON_MULTIPLE);

const smoothstep = (x: number) => x * x * (3 - 2 * x);

/**
 * Price path of one token as a multiple of its launch price, advanced one tick at a time.
 * The path follows the fate's target curve plus mean-reverting noise, so it looks random
 * but always ends up where the fate says. Same seed + options → same path.
 */
export class TokenSim {
  readonly plan: FatePlan;
  tick = 0;
  multiple = 1;

  private readonly rng: Rng;
  private noise = 0;
  private segment = 0;

  constructor(readonly seed: string, options: TokenSimOptions = {}) {
    this.rng = createRng(seed);
    // Always roll, even when the fate is forced, so the rest of the random stream (and the path)
    // only depends on (seed, fate).
    const rolled = rollFate(this.rng);
    this.plan = buildPlan(options.fate ?? rolled, this.rng);
  }

  get fate(): Fate {
    return this.plan.fate;
  }

  get done(): boolean {
    return this.tick >= this.plan.endTick;
  }

  /** Advances one tick and returns the new multiple. No-op once done. */
  step(): number {
    if (this.done) return this.multiple;
    this.tick++;

    const { logMultiple, sigma } = this.targetAt(this.tick);
    let shock = sigma * this.rng.normal();
    if (this.rng.chance(JUMP_CHANCE)) shock += sigma * JUMP_SIZE_SIGMAS * this.rng.normal();
    this.noise += -NOISE_REVERSION * this.noise + shock;

    let log = logMultiple + this.noise;
    if (this.plan.fate !== "moon") log = Math.min(log, MAX_NON_MOON_LOG);
    this.multiple = Math.exp(log);
    return this.multiple;
  }

  /** Ticks must be requested in increasing order. */
  private targetAt(tick: number): { logMultiple: number; sigma: number } {
    const kfs = this.plan.keyframes;
    while (this.segment + 1 < kfs.length && kfs[this.segment + 1]!.tick <= tick) this.segment++;
    const a = kfs[this.segment]!;
    const b = kfs[this.segment + 1];
    if (!b) return a;
    const f = smoothstep((tick - a.tick) / (b.tick - a.tick));
    return { logMultiple: a.logMultiple + (b.logMultiple - a.logMultiple) * f, sigma: a.sigma };
  }
}

/** Full path from launch (tick 0 = 1x) to the end of the token's life. */
export function simulatePath(seed: string, options?: TokenSimOptions): { sim: TokenSim; multiples: number[] } {
  const sim = new TokenSim(seed, options);
  const multiples = [sim.multiple];
  while (!sim.done) multiples.push(sim.step());
  return { sim, multiples };
}

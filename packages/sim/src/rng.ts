/** Seeded PRNG, so a token's whole price path can be regenerated from its seed. */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  range(min: number, max: number): number;
  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number;
  /** Uniform in log space, so 2x→4x is as likely as 4x→8x. */
  logRange(min: number, max: number): number;
  /** Standard normal sample. */
  normal(): number;
  /** Power-law sample with minimum `xm`. Lower `alpha` means fatter tail. */
  pareto(xm: number, alpha: number): number;
  chance(p: number): boolean;
}

/** cyrb53-style string hash folded to 32 bits. */
function hashSeed(seed: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

export function createRng(seed: string): Rng {
  let state = hashSeed(seed);
  let spareNormal: number | null = null;

  // mulberry32
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const nonZero = (): number => {
    let u = 0;
    while (u === 0) u = next();
    return u;
  };

  const rng: Rng = {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    logRange: (min, max) => Math.exp(rng.range(Math.log(min), Math.log(max))),
    normal() {
      if (spareNormal !== null) {
        const s = spareNormal;
        spareNormal = null;
        return s;
      }
      // Box-Muller
      const mag = Math.sqrt(-2 * Math.log(nonZero()));
      const angle = 2 * Math.PI * next();
      spareNormal = mag * Math.sin(angle);
      return mag * Math.cos(angle);
    },
    pareto: (xm, alpha) => xm / Math.pow(nonZero(), 1 / alpha),
    chance: (p) => next() < p,
  };
  return rng;
}

export function randomSeed(): string {
  return crypto.randomUUID();
}

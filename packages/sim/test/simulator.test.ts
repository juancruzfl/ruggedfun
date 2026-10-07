import { describe, expect, it } from "vitest";
import {
  createRng,
  FATE_WEIGHTS,
  GRADUATION_MULTIPLE,
  HOUSE_TUNING,
  MAX_NON_MOON_MULTIPLE,
  rollFate,
  simulatePath,
  TokenSim,
  type Fate,
} from "../src";

const SAMPLES = 150;
const seeds = (prefix: string) => Array.from({ length: SAMPLES }, (_, i) => `${prefix}-${i}`);

describe("rollFate", () => {
  it("matches the configured weights", () => {
    const rng = createRng("fates");
    const n = 200_000;
    const counts: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const fate = rollFate(rng);
      counts[fate] = (counts[fate] ?? 0) + 1;
    }
    for (const [fate, weight] of Object.entries(FATE_WEIGHTS)) {
      expect((counts[fate] ?? 0) / n).toBeCloseTo(weight, 2);
    }
  });
});

describe("simulatePath", () => {
  it("is deterministic per seed", () => {
    expect(simulatePath("same").multiples).toEqual(simulatePath("same").multiples);
    expect(simulatePath("same").multiples).not.toEqual(simulatePath("other").multiples);
  });

  it("starts at exactly 1x and ends at the planned tick", () => {
    for (const fate of Object.keys(FATE_WEIGHTS) as Fate[]) {
      const { sim, multiples } = simulatePath("start", { fate });
      expect(multiples[0]).toBe(1);
      expect(multiples.length).toBe(sim.plan.endTick + 1);
    }
  });

  it("rugs drop at least 90% in a single tick", () => {
    for (const seed of seeds("rug")) {
      const { sim, multiples } = simulatePath(seed, { fate: "rug" });
      const rugTick = sim.plan.rugTick!;
      expect(multiples[rugTick]! / multiples[rugTick - 1]!).toBeLessThan(0.1);
    }
  });

  it("only moons reach the graduation price", () => {
    for (const fate of ["rug", "slow_death", "survive"] as const) {
      for (const seed of seeds(fate)) {
        expect(Math.max(...simulatePath(seed, { fate }).multiples)).toBeLessThan(GRADUATION_MULTIPLE);
      }
    }
    for (const seed of seeds("moon")) {
      expect(Math.max(...simulatePath(seed, { fate: "moon" }).multiples)).toBeGreaterThan(GRADUATION_MULTIPLE);
    }
  });

  it("slow deaths end near zero and survivors end near launch price", () => {
    for (const seed of seeds("slow")) {
      expect(simulatePath(seed, { fate: "slow_death" }).multiples.at(-1)).toBeLessThan(0.15);
    }
    for (const seed of seeds("survive")) {
      const final = simulatePath(seed, { fate: "survive" }).multiples.at(-1)!;
      expect(final).toBeGreaterThan(0.25);
      expect(final).toBeLessThan(4);
    }
  });
});

describe("forced fates", () => {
  it("give the same path as an unforced sim that rolled that fate", () => {
    for (let i = 0; i < 50; i++) {
      const seed = `forced-${i}`;
      const natural = simulatePath(seed);
      expect(simulatePath(seed, { fate: natural.sim.fate }).multiples).toEqual(natural.multiples);
    }
  });
});

describe("house token", () => {
  it("never ends and stays around its multiple, below graduation", () => {
    const sim = new TokenSim("house");
    const house = new TokenSim("house", { fate: "house" });
    expect(sim.fate).not.toBe("house");
    expect(house.multiple).toBe(HOUSE_TUNING.multiple);

    const day = 24 * 3600;
    let sumLog = 0;
    let max = 0;
    for (let i = 0; i < day; i++) {
      const m = house.step();
      sumLog += Math.log(m);
      max = Math.max(max, m);
    }
    expect(house.done).toBe(false);
    expect(house.tick).toBe(day);
    expect(house.plan.rugTick).toBeUndefined();
    expect(max).toBeLessThan(MAX_NON_MOON_MULTIPLE * (1 + 1e-9));
    expect(Math.exp(sumLog / day) / HOUSE_TUNING.multiple).toBeGreaterThan(0.7);
    expect(Math.exp(sumLog / day) / HOUSE_TUNING.multiple).toBeLessThan(1.3);
  });

  it("resumes from a saved tick and multiple instead of replaying", () => {
    const sim = new TokenSim("house", { fate: "house", resume: { tick: 5_000_000, multiple: 6.5 } });
    expect(sim.tick).toBe(5_000_000);
    expect(sim.multiple).toBe(6.5);
    sim.step();
    expect(sim.tick).toBe(5_000_001);
    expect(sim.multiple).toBeGreaterThan(6);
    expect(sim.multiple).toBeLessThan(7);
  });

  it("can't be run to the end", () => {
    expect(() => simulatePath("house", { fate: "house" })).toThrow();
  });
});

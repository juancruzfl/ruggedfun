import { describe, expect, it } from "vitest";
import { createRng } from "../src";

describe("createRng", () => {
  it("is deterministic per seed", () => {
    const a = createRng("abc");
    const b = createRng("abc");
    const c = createRng("abd");
    const seqA = Array.from({ length: 10 }, () => a.next());
    expect(Array.from({ length: 10 }, () => b.next())).toEqual(seqA);
    expect(Array.from({ length: 10 }, () => c.next())).not.toEqual(seqA);
  });

  it("produces roughly standard normals", () => {
    const rng = createRng("normal");
    const xs = Array.from({ length: 50_000 }, () => rng.normal());
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length;
    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(Math.abs(variance - 1)).toBeLessThan(0.03);
  });

  it("keeps int() within inclusive bounds", () => {
    const rng = createRng("int");
    const seen = new Set(Array.from({ length: 1000 }, () => rng.int(2, 5)));
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });
});

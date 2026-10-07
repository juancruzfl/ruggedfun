import { createRng } from "@ruggedfun/sim";
import { describe, expect, it } from "vitest";
import { generateTokenMeta } from "../src/names";

describe("generateTokenMeta", () => {
  it("produces valid tickers and fills in names", () => {
    const rng = createRng("names");
    for (let i = 0; i < 2000; i++) {
      const meta = generateTokenMeta(rng);
      expect(meta.ticker).toMatch(/^[A-Z0-9]{3,8}$/);
      expect(meta.description).not.toContain("{name}");
      expect(meta.creatorHandle.length).toBeGreaterThan(2);
    }
  });

  it("adds digits on retry attempts", () => {
    expect(generateTokenMeta(createRng("x"), 2).ticker).toMatch(/\d{3}$/);
  });
});

import { describe, expect, it } from "vitest";
import { randomUsername, validateUsername } from "../src";

describe("validateUsername", () => {
  it("accepts normal names", () => {
    for (const name of ["degen42", "xX_ape_Xx", "abc", "a".repeat(16)]) expect(validateUsername(name)).toBeNull();
  });

  it("rejects bad lengths and characters", () => {
    expect(validateUsername("ab")).toMatch(/At least/);
    expect(validateUsername("a".repeat(17))).toMatch(/At most/);
    for (const name of ["has space", "emoji🚀", "dash-name", "dot.name"]) {
      expect(validateUsername(name)).toMatch(/Letters/);
    }
  });

  it("rejects blocked words in any case", () => {
    expect(validateUsername("RuggedFun_Admin")).not.toBeNull();
    expect(validateUsername("xxHITLERxx")).not.toBeNull();
    expect(validateUsername("big_Jeet9")).not.toBeNull();
  });
});

describe("randomUsername", () => {
  it("always produces a valid username", () => {
    for (let i = 0; i < 10_000; i++) {
      const name = randomUsername();
      expect(validateUsername(name), name).toBeNull();
    }
  });

  it("varies", () => {
    expect(new Set(Array.from({ length: 50 }, () => randomUsername())).size).toBeGreaterThan(40);
  });
});

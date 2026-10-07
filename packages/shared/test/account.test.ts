import { describe, expect, it } from "vitest";
import { validateUsername } from "../src";

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

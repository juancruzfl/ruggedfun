import { describe, expect, it } from "vitest";
import { avatarUrl, normalizeTicker, validateLaunch, type LaunchRequest } from "../src";

const good: LaunchRequest = {
  name: "Moon Frog",
  ticker: "mfrog",
  description: "ribbit to the moon",
  avatarStyle: "fun-emoji",
  avatarSeed: "abc123",
  devBuySol: 1,
};

describe("validateLaunch", () => {
  it("accepts a normal launch (ticker case doesn't matter)", () => {
    expect(validateLaunch(good)).toEqual({});
    expect(validateLaunch({ ...good, devBuySol: 0, description: "" })).toEqual({});
  });

  it("rejects bad names, tickers and descriptions", () => {
    expect(validateLaunch({ ...good, name: "x" }).name).toMatch(/At least/);
    expect(validateLaunch({ ...good, name: "<script>" }).name).toMatch(/Letters/);
    expect(validateLaunch({ ...good, ticker: "$ab-c" }).ticker).toMatch(/Letters and numbers/);
    expect(validateLaunch({ ...good, ticker: "$sol" }).ticker).toMatch(/real coin/);
    expect(validateLaunch({ ...good, ticker: "$ruggedfun" }).ticker).toMatch(/ruggedfun's own/);
    expect(validateLaunch({ ...good, ticker: "WAYTOOLONGTICKER" }).ticker).toMatch(/At most/);
    expect(validateLaunch({ ...good, description: "x".repeat(141) }).description).toMatch(/At most/);
    expect(validateLaunch({ ...good, name: "Nazi Frog" }).name).toBeDefined();
  });

  it("only accepts known avatar styles and plain seeds", () => {
    expect(validateLaunch({ ...good, avatarStyle: "evil" as never }).avatarStyle).toBeDefined();
    expect(validateLaunch({ ...good, avatarSeed: "https://evil.example/x.png" }).avatarStyle).toBeDefined();
  });

  it("limits the dev buy", () => {
    expect(validateLaunch({ ...good, devBuySol: -1 }).devBuySol).toBeDefined();
    expect(validateLaunch({ ...good, devBuySol: 6 }).devBuySol).toBeDefined();
  });
});

describe("helpers", () => {
  it("normalizes tickers and builds avatar URLs", () => {
    expect(normalizeTicker(" $mFrog ")).toBe("MFROG");
    expect(avatarUrl("bottts", "a b")).toBe("https://api.dicebear.com/9.x/bottts/svg?seed=a%20b");
  });
});

import { describe, expect, it } from "vitest";
import { alertSteps, evaluateAlert, type AlertState } from "../src";

const T = 1_000_000;

/** Feeds a sequence of [pnlPct, secondsLater] updates through evaluateAlert and returns what fired. */
function run(updates: [pct: number, at: number][], cost = 1, initial?: AlertState) {
  let state = initial;
  const fired: number[] = [];
  for (const [pct, at] of updates) {
    const result = evaluateAlert(state, cost, pct, T + at * 1000);
    state = result.state;
    if (result.fire !== null) fired.push(result.fire * 5);
  }
  return fired;
}

describe("alertSteps", () => {
  it("counts whole 5% steps in both directions, including exact multiples", () => {
    expect(alertSteps(-0.2)).toBe(-4);
    expect(alertSteps(-0.12)).toBe(-2);
    expect(alertSteps(-0.049)).toBe(0);
    expect(alertSteps(-0.99)).toBe(-19);
    expect(alertSteps(0.049)).toBe(0);
    expect(alertSteps(0.05)).toBe(1);
    expect(alertSteps(0.15)).toBe(3);
    expect(alertSteps(0.17)).toBe(3);
    expect(alertSteps(9)).toBe(180);
  });
});

describe("evaluateAlert", () => {
  it("is silent on first sight, then fires each new step once", () => {
    expect(run([[0, 0], [0.06, 15], [0.07, 30], [0.11, 45], [0.16, 60]])).toEqual([5, 10, 15]);
  });

  it("doesn't replay levels already reached when tracking starts", () => {
    expect(run([[0.23, 0], [0.24, 15], [0.26, 30]])).toEqual([25]);
  });

  it("fires one alert for a big jump", () => {
    expect(run([[0, 0], [0.27, 15]])).toEqual([25]);
  });

  it("doesn't re-alert after dipping and recovering", () => {
    expect(run([[0, 0], [0.11, 15], [0.02, 30], [0.12, 45], [0.16, 60]])).toEqual([10, 15]);
  });

  it("throttles to one alert per 10s, then catches up to the highest step", () => {
    expect(run([[0, 0], [0.06, 15], [0.11, 18], [0.21, 21], [0.22, 26]])).toEqual([5, 20]);
  });

  it("resets the baseline silently when the cost basis changes", () => {
    let { state } = evaluateAlert(undefined, 1, 0, T);
    ({ state } = evaluateAlert(state, 1, 0.12, T + 15_000));
    expect(state.highestSteps).toBe(2);
    const afterBuy = evaluateAlert(state, 2, 0.06, T + 30_000);
    expect(afterBuy.fire).toBeNull();
    expect(evaluateAlert(afterBuy.state, 2, 0.11, T + 45_000).fire).toBe(2);
  });

  it("fires each new 5% low on the way down", () => {
    expect(run([[0, 0], [-0.03, 15], [-0.06, 30], [-0.07, 45], [-0.11, 60], [-0.16, 75]])).toEqual([-5, -10, -15]);
  });

  it("fires one alert for a big drop", () => {
    expect(run([[0, 0], [-0.62, 15]])).toEqual([-60]);
  });

  it("doesn't replay lows already reached when tracking starts", () => {
    expect(run([[-0.23, 0], [-0.24, 15], [-0.26, 30]])).toEqual([-25]);
  });

  it("doesn't re-alert a low after bouncing back up", () => {
    expect(run([[0, 0], [-0.11, 15], [-0.02, 30], [-0.12, 45], [-0.16, 60]])).toEqual([-10, -15]);
  });

  it("tracks highs and lows separately: a pump, then a dump through break-even", () => {
    expect(run([[0, 0], [0.11, 15], [0.04, 30], [-0.06, 45], [0.16, 60]])).toEqual([10, -5, 15]);
  });

  it("throttles drops too, then catches up to the lowest step", () => {
    expect(run([[0, 0], [-0.06, 15], [-0.11, 18], [-0.21, 21], [-0.22, 26]])).toEqual([-5, -20]);
  });
});

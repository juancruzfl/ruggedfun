/**
 * Simulates a batch of tokens and prints the fate distribution, path stats and sample sparklines.
 * Use it to tune src/config.ts.
 *
 *   npm run report -w @ruggedfun/sim -- [count] [seedPrefix]
 */
import { FATE_WEIGHTS, GRADUATION_MULTIPLE, simulatePath, TICK_SECONDS, type Fate } from "../src";

const count = Number(process.argv[2] ?? 1000);
const prefix = process.argv[3] ?? "report";
const fates = Object.keys(FATE_WEIGHTS) as Fate[];

interface Result {
  fate: Fate;
  peak: number;
  final: number;
  seconds: number;
  multiples: number[];
}

const results: Result[] = [];
for (let i = 0; i < count; i++) {
  const { sim, multiples } = simulatePath(`${prefix}-${i}`);
  results.push({
    fate: sim.fate,
    peak: Math.max(...multiples),
    final: multiples.at(-1)!,
    seconds: sim.plan.endTick * TICK_SECONDS,
    multiples,
  });
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const mult = (n: number) => (n >= 100 ? `${n.toFixed(0)}x` : n >= 1 ? `${n.toFixed(2)}x` : `${n.toFixed(3)}x`);
const duration = (s: number) => (s >= 3600 ? `${(s / 3600).toFixed(1)}h` : `${Math.round(s / 60)}m`);
const quantile = (xs: number[], q: number) => {
  if (xs.length === 0) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
};

const BARS = "▁▂▃▄▅▆▇█";
function sparkline(multiples: number[], width = 48): string {
  const logs = Array.from({ length: width }, (_, i) =>
    Math.log(multiples[Math.floor((i / width) * multiples.length)]!),
  );
  const lo = Math.min(...logs);
  const hi = Math.max(...logs);
  return logs.map((l) => BARS[Math.round(((l - lo) / (hi - lo || 1)) * (BARS.length - 1))]).join("");
}

console.log(`\nSimulated ${count} tokens (seed prefix "${prefix}")\n`);
const rows = fates.map((fate) => {
  const group = results.filter((r) => r.fate === fate);
  return {
    fate,
    expected: pct(FATE_WEIGHTS[fate]),
    actual: pct(group.length / count),
    n: group.length,
    "peak p50": mult(quantile(group.map((r) => r.peak), 0.5)),
    "peak p90": mult(quantile(group.map((r) => r.peak), 0.9)),
    "final p50": mult(quantile(group.map((r) => r.final), 0.5)),
    "life p50": duration(quantile(group.map((r) => r.seconds), 0.5)),
  };
});
console.table(rows);

const graduated = results.filter((r) => r.peak >= GRADUATION_MULTIPLE).length;
const tenX = results.filter((r) => r.peak >= 10).length;
const lostMost = results.filter((r) => r.final < 0.1).length;
console.log(`Graduated (peak ≥ ${GRADUATION_MULTIPLE.toFixed(1)}x): ${graduated} (${pct(graduated / count)})`);
console.log(`Ever hit 10x:                ${tenX} (${pct(tenX / count)})`);
console.log(`Ended below 0.1x:            ${lostMost} (${pct(lostMost / count)})`);

console.log("\nSamples (log scale):");
for (const fate of fates) {
  for (const r of results.filter((r) => r.fate === fate).slice(0, 3)) {
    console.log(
      `${fate.padEnd(10)} ${sparkline(r.multiples)}  peak ${mult(r.peak).padStart(7)} → ${mult(r.final).padStart(7)} in ${duration(r.seconds)}`,
    );
  }
}
console.log();

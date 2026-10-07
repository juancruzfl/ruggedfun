/** Tiny price line. Log scale, so a rug is a cliff rather than a flat line at zero. */
export function Sparkline({ points, className = "" }: { points: number[]; className?: string }) {
  const W = 100;
  const H = 30;
  const logs = points.filter((p) => p > 0).map(Math.log);
  if (logs.length < 2) return <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden />;

  const lo = Math.min(...logs);
  const hi = Math.max(...logs);
  const span = hi - lo || 1;
  const coords = logs.map((l, i) => `${(i / (logs.length - 1)) * W},${H - 2 - ((l - lo) / span) * (H - 4)}`);
  const up = logs[logs.length - 1]! >= logs[0]!;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} aria-hidden>
      <polygon points={`0,${H} ${coords.join(" ")} ${W},${H}`} className={up ? "fill-pump/10" : "fill-rug/10"} />
      <polyline
        points={coords.join(" ")}
        fill="none"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        className={up ? "stroke-pump" : "stroke-rug"}
      />
    </svg>
  );
}

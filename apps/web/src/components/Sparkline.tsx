/**
 * Tiny price line. Log scale, so a rug is a cliff rather than a flat line at zero.
 * `minRange` (a price ratio, e.g. 1.5) keeps small moves small instead of stretching them to full height.
 */
export function Sparkline({
  points,
  className = "",
  minRange = 1,
}: {
  points: number[];
  className?: string;
  minRange?: number;
}) {
  const W = 100;
  const H = 30;
  const logs = points.filter((p) => p > 0).map(Math.log);
  if (logs.length < 2) return <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden />;

  const min = Math.min(...logs);
  const max = Math.max(...logs);
  const span = Math.max(max - min, Math.log(minRange)) || 1;
  // Centered when the minimum range is wider than the data.
  const lo = (min + max) / 2 - span / 2;
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

import type { TokenStatus } from "@ruggedfun/shared";
import { formatPct, priceParts } from "@/lib/format";

export { TokenAvatar } from "./TokenAvatar";

export function StatusBadge({ status }: { status: TokenStatus }) {
  if (status === "rugged") {
    return <span className="shrink-0 rounded bg-rug/15 px-1.5 py-0.5 text-[10px] font-bold text-rug">💀 RUGGED</span>;
  }
  if (status === "graduated") {
    return <span className="shrink-0 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">🎓 GRADUATED</span>;
  }
  if (status === "dead") {
    return <span className="shrink-0 rounded bg-line px-1.5 py-0.5 text-[10px] font-bold text-muted">DEAD</span>;
  }
  return null;
}

export function Change({ value, className = "" }: { value: number; className?: string }) {
  const dir = value >= 0.0005 ? "up" : value <= -0.0005 ? "down" : "flat";
  const color = { up: "text-pump", down: "text-rug", flat: "text-muted" }[dir];
  // The arrow repeats the direction in shape, for anyone who can't tell the red from the green.
  const arrow = { up: "▲", down: "▼", flat: "" }[dir];
  return (
    <span className={`font-mono ${color} ${className}`}>
      {arrow && (
        <span aria-hidden className="mr-0.5 text-[0.75em]">
          {arrow}
        </span>
      )}
      {formatPct(value)}
    </span>
  );
}

/** Tiny SOL price with the zero run as a real subscript (fonts often lack the ₀–₉ glyphs). */
export function Price({ value }: { value: number }) {
  const { zeros, digits } = priceParts(value);
  if (zeros === 0) return <>{digits}</>;
  return (
    <span aria-label={value.toFixed(zeros + 3)}>
      0.0<sub className="text-[0.7em]">{zeros}</sub>
      {digits}
    </span>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div
      className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-2"
      role="progressbar"
      aria-label="Bonding curve progress"
      aria-valuenow={Math.round(value * 100)}
    >
      <div className="h-full rounded-full bg-pump transition-[width] duration-700" style={{ width: `${value * 100}%` }} />
    </div>
  );
}

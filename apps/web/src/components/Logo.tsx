// Same artwork as app/icon.svg, so the navbar matches the favicon.
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <g transform="rotate(-45 16 16)">
        <rect x="4" y="10" width="24" height="12" rx="6" fill="var(--color-pump)" />
        <path d="M16 10h6a6 6 0 0 1 0 12h-6z" fill="var(--color-rug)" />
      </g>
    </svg>
  );
}

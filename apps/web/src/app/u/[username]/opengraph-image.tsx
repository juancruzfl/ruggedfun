import { ImageResponse } from "next/og";
import { formatPct, formatSol } from "@/lib/format";
import { getProfile } from "@/lib/profile";

// The shareable PnL card: what link previews on X, Discord etc. show for a profile, and the image
// behind the profile page's Download button. Rendered fresh on every request so the numbers are current.
export const dynamic = "force-dynamic";
export const alt = "ruggedfun PnL card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// globals.css colors in hex (the image renderer can't read CSS variables).
const C = {
  bg: "#090d0b",
  panel: "#101714",
  panel2: "#19201d",
  line: "#252e2a",
  text: "#ebf0ed",
  muted: "#95a29c",
  pump: "#4ade80",
  rug: "#f43f5e",
};

/** The renderer doesn't apply 8-digit hex transparency in gradients, so translucent colors use rgba. */
const PUMP_RGB = "74, 222, 128";
const RUG_RGB = "244, 63, 94";

const signed = (sol: number) => `${sol >= 0 ? "+" : "−"}${formatSol(Math.abs(sol))}`;
const tone = (n: number) => (n > 0 ? C.pump : n < 0 ? C.rug : C.muted);

function Stat({ label, value, color = C.text }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
      <span style={{ fontSize: 18, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 32, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

/** Net worth over the last day, as a filled line. Nothing if there's too little history. */
function Chart({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return null;
  const W = 340;
  const H = 150;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = hi - lo || 1;
  const xy = points.map((v, i) => `${(i / (points.length - 1)) * W},${H - 6 - ((v - lo) / span) * (H - 12)}`);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ flexShrink: 0 }}>
      <polygon points={`0,${H} ${xy.join(" ")} ${W},${H}`} fill={color} fillOpacity={0.12} />
      <polyline points={xy.join(" ")} fill="none" stroke={color} strokeWidth={4} strokeLinejoin="round" />
    </svg>
  );
}

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await getProfile(decodeURIComponent(username));

  return new ImageResponse(
    (
      // The 2px border fades green to red, the logo's two halves, like the site's top bar.
      <div style={{ display: "flex", width: "100%", height: "100%", background: C.bg, padding: 32 }}>
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            borderRadius: 32,
            padding: 2,
            backgroundImage: `linear-gradient(90deg, rgba(${PUMP_RGB}, 0.6), ${C.line}, rgba(${RUG_RGB}, 0.6))`,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              height: "100%",
              borderRadius: 30,
              padding: "36px 48px",
              color: C.text,
              // Solid stops (8% green and 6% red mixed into the panel color): with a gradient the renderer
              // skips backgroundColor, so translucent stops would show the border gradient behind them.
              backgroundImage: `linear-gradient(135deg, #152719, ${C.panel} 45%, #1e1918)`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <svg width="44" height="44" viewBox="0 0 32 32">
                  <g transform="rotate(-45 16 16)">
                    <rect x="4" y="10" width="24" height="12" rx="6" fill={C.pump} />
                    <path d="M16 10h6a6 6 0 0 1 0 12h-6z" fill={C.rug} />
                  </g>
                </svg>
                <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>
                  <span style={{ color: C.rug }}>rugged</span>
                  <span style={{ color: C.pump }}>fun</span>
                </div>
              </div>
              {profile?.rank && (
                <div
                  style={{
                    display: "flex",
                    fontSize: 24,
                    color: C.pump,
                    background: `rgba(${PUMP_RGB}, 0.13)`,
                    borderRadius: 999,
                    padding: "8px 20px",
                  }}
                >
                  {`#${profile.rank.place} of ${profile.rank.of} on the leaderboard`}
                </div>
              )}
            </div>

            {profile ? (
              // A real element, not a fragment: the renderer lays a fragment's children out as a row.
              <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 32, marginTop: 36 }}>
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 40, color: C.muted }}>@{profile.username}</span>
                    <span style={{ fontSize: 20, color: C.muted, marginTop: 18, letterSpacing: 1 }}>ALL-TIME PNL</span>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
                      <span style={{ fontSize: 96, fontWeight: 700, color: tone(profile.pnlSol), lineHeight: 1.1 }}>
                        {`${signed(profile.pnlSol)} SOL`}
                      </span>
                      <span style={{ fontSize: 40, fontWeight: 700, color: tone(profile.pnlSol) }}>
                        {formatPct(profile.pnlPct)}
                      </span>
                    </div>
                  </div>
                  <Chart points={profile.history} color={tone(profile.pnl24hSol)} />
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: "auto",
                    paddingTop: 24,
                    borderTop: `2px solid ${C.line}`,
                  }}
                >
                  <Stat label="24h PnL" value={`${signed(profile.pnl24hSol)} SOL`} color={tone(profile.pnl24hSol)} />
                  <Stat label="Net worth" value={`${formatSol(profile.netWorthSol)} SOL`} />
                  <Stat label="Win rate" value={profile.winRate === null ? "—" : `${Math.round(profile.winRate * 100)}%`} />
                  <Stat label="Trades" value={profile.trades.toLocaleString("en-US")} />
                  <Stat
                    label="Best win"
                    value={profile.bestWin ? `${profile.bestWin.multiple.toFixed(1)}x $${profile.bestWin.ticker}` : "—"}
                    color={profile.bestWin ? C.pump : C.text}
                  />
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", fontSize: 48, color: C.muted }}>
                Player not found
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, fontSize: 18, color: C.muted }}>
              <span>ruggedfun.xyz</span>
              <span>Play money. Not financial advice.</span>
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}

import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { Appear, Headline, HL, Person, Stage } from "../ui";
import { COLORS } from "../theme";

// One RM pulled across the whole book — attention diluted to minutes each.
const OverstretchedRM: React.FC<{ at: number; size: number }> = ({ at, size }) => {
  const frame = useCurrentFrame();
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.43;
  const N = 18;
  const clients = Array.from({ length: N }, (_, i) => {
    const a = ((-90 + (i * 360) / N) * Math.PI) / 180;
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), at: at + i * 2 };
  });
  const rmSize = size * 0.17;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {clients.map((c, i) => {
          const rev = interpolate(frame, [c.at, c.at + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return <line key={i} x1={cx} y1={cy} x2={cx + (c.x - cx) * rev} y2={cy + (c.y - cy) * rev} stroke={COLORS.inkFaint} strokeWidth={1.5} opacity={0.4} />;
        })}
      </svg>
      {clients.map((c, i) => {
        const o = interpolate(frame, [c.at + 4, c.at + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const d = size * 0.085;
        return (
          <div key={i} style={{ position: "absolute", left: c.x, top: c.y, transform: "translate(-50%,-50%)", opacity: o, width: d, height: d, borderRadius: 999, background: "#eee", display: "grid", placeItems: "center" }}>
            <Person size={d * 0.58} color={COLORS.inkFaint} />
          </div>
        );
      })}
      {/* the one RM at the centre */}
      <div style={{ position: "absolute", left: cx, top: cy, transform: "translate(-50%,-50%)", width: rmSize, height: rmSize, borderRadius: 999, background: COLORS.warning, display: "grid", placeItems: "center", boxShadow: "0 14px 34px -12px rgba(247,144,9,0.6)" }}>
        <Person size={rmSize * 0.56} color="#fff" />
      </div>
      <div style={{ position: "absolute", left: cx, top: cy + rmSize * 0.62, transform: "translateX(-50%)", fontSize: 19, fontWeight: 700, letterSpacing: "0.1em", color: COLORS.warning }}>
        ONE RM
      </div>
    </div>
  );
};

export const ProblemScene: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker="The problem">
    <Appear at={8}>
      <Headline size={60}>
        Billionaires get a dedicated team. <HL>One RM can&rsquo;t</HL>.
      </Headline>
    </Appear>

    <div style={{ marginTop: 8, display: "flex", alignItems: "center", flex: 1, gap: 40 }}>
      <Appear at={24} style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        <OverstretchedRM at={36} size={560} />
      </Appear>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 22 }}>
        <Appear at={20}>
          <div style={{ fontSize: 80, fontWeight: 300, letterSpacing: "-0.02em", color: COLORS.ink }}>
            1 <span style={{ color: COLORS.inkFaint }}>:</span> 40
          </div>
        </Appear>
        <Appear at={34}>
          <div style={{ fontSize: 30, lineHeight: 1.45, color: COLORS.inkSoft, maxWidth: 620 }}>
            One relationship manager, split across the whole book. Bespoke, values-aware advice
            can&rsquo;t scale by hand — every client gets{" "}
            <strong style={{ color: COLORS.ink, fontWeight: 600 }}>minutes, not a team</strong>.
          </div>
        </Appear>
      </div>
    </div>
  </Stage>
);

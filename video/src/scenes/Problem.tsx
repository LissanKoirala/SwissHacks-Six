import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { Appear, Headline, HL, Person, Stage, TeamCluster } from "../ui";
import { COLORS } from "../theme";

const ROLES = ["News", "Profile", "Strategy", "Dialogue", "Rendezvous"];

// One RM pulled across many clients — attention diluted, not divided.
const OverstretchedRM: React.FC<{ at: number; size?: number }> = ({ at, size = 460 }) => {
  const frame = useCurrentFrame();
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.42;
  const N = 14;
  const clients = Array.from({ length: N }, (_, i) => {
    const a = ((-90 + (i * 360) / N) * Math.PI) / 180;
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), at: at + i * 2 };
  });
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {clients.map((c, i) => {
          const rev = interpolate(frame, [c.at, c.at + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <line key={i} x1={cx} y1={cy} x2={cx + (c.x - cx) * rev} y2={cy + (c.y - cy) * rev} stroke={COLORS.inkFaint} strokeWidth={1.5} opacity={0.4} />
          );
        })}
      </svg>
      {clients.map((c, i) => {
        const o = interpolate(frame, [c.at + 4, c.at + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <div key={i} style={{ position: "absolute", left: c.x, top: c.y, transform: "translate(-50%,-50%)", opacity: o, width: 38, height: 38, borderRadius: 999, background: "#eee", display: "grid", placeItems: "center" }}>
            <Person size={22} color={COLORS.inkFaint} />
          </div>
        );
      })}
      {/* the one RM at the centre */}
      <div style={{ position: "absolute", left: cx, top: cy, transform: "translate(-50%,-50%)", width: 96, height: 96, borderRadius: 999, background: COLORS.warning, display: "grid", placeItems: "center", boxShadow: "0 12px 30px -12px rgba(247,144,9,0.6)" }}>
        <Person size={54} color="#fff" />
      </div>
    </div>
  );
};

const Panel: React.FC<{ label: string; sub: string; tint: string; children: React.ReactNode; at: number }> = ({ label, sub, tint, children, at }) => (
  <Appear at={at} style={{ flex: 1, display: "flex" }}>
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, borderRadius: 18, boxShadow: `inset 0 0 0 1.5px ${COLORS.border}`, padding: "24px 20px 28px" }}>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.12em", color: tint }}>{label}</div>
      <div style={{ flex: 1, display: "flex", alignItems: "center" }}>{children}</div>
      <div style={{ fontSize: 24, color: COLORS.inkSoft, textAlign: "center" }}>{sub}</div>
    </div>
  </Appear>
);

export const ProblemScene: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker="The problem">
    <Appear at={8}>
      <Headline size={62}>
        Billionaires get a team. <HL>Everyone else</HL> gets a sliver of an RM.
      </Headline>
    </Appear>

    <div style={{ marginTop: 24, display: "flex", gap: 32, flex: 1 }}>
      <Panel at={24} label="THE BILLIONAIRE" sub="A dedicated team, focused on them." tint={COLORS.primary}>
        <TeamCluster size={400} roles={ROLES} at={30} pillFont={17} />
      </Panel>
      <Panel at={40} label="EVERYONE ELSE" sub="One RM, split across the whole book — minutes each." tint={COLORS.warning}>
        <OverstretchedRM at={52} size={400} />
      </Panel>
    </div>
  </Stage>
);

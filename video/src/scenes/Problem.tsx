import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { Appear, Headline, HL, Person, Stage } from "../ui";
import { COLORS } from "../theme";

// concentric rings totalling 100 client slots around the RM
const SIZE = 620;
const CX = SIZE / 2;
const CY = SIZE / 2;
const RINGS = [
  { r: 0.16, n: 8 },
  { r: 0.27, n: 14 },
  { r: 0.37, n: 20 },
  { r: 0.46, n: 26 },
  { r: 0.55, n: 32 },
];
const SLOTS: { x: number; y: number }[] = [];
RINGS.forEach((ring) => {
  for (let i = 0; i < ring.n; i++) {
    const a = ((-90 + (i * 360) / ring.n) * Math.PI) / 180;
    SLOTS.push({ x: CX + ring.r * SIZE * Math.cos(a), y: CY + ring.r * SIZE * Math.sin(a) });
  }
});

// N (clients per RM) sweeps 10 → 100 over the scene
const N_FROM = 22;
const N_TO = 140;

export const ProblemScene: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const N = interpolate(frame, [N_FROM, N_TO], [10, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const clients = Math.round(N);
  const minutes = Math.round(900 / N); // ~90 min at 1:10 → ~9 min at 1:100
  const dot = SIZE * 0.026;
  const rmSize = SIZE * 0.16;

  return (
    <Stage dur={dur} kicker="The problem">
      <Appear at={8}>
        <Headline size={54}>
          A billionaire gets a dedicated team. <HL>Everyone else shares one RM</HL>.
        </Headline>
      </Appear>

      <div style={{ marginTop: 6, display: "flex", alignItems: "center", flex: 1, gap: 36 }}>
        {/* the RM, swamped by an ever-growing book */}
        <Appear at={18} style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <div style={{ position: "relative", width: SIZE, height: SIZE }}>
            {SLOTS.map((s, i) => {
              const o = interpolate(N, [i - 1, i + 1.5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) * 0.85;
              return (
                <div key={i} style={{ position: "absolute", left: s.x, top: s.y, transform: "translate(-50%,-50%)", opacity: o, width: dot, height: dot, borderRadius: 999, background: "#e6e6e6", display: "grid", placeItems: "center" }}>
                  <Person size={dot * 0.6} color={COLORS.inkFaint} />
                </div>
              );
            })}
            {/* the one RM at the centre */}
            <div style={{ position: "absolute", left: CX, top: CY, transform: "translate(-50%,-50%)", width: rmSize, height: rmSize, borderRadius: 999, background: COLORS.warning, display: "grid", placeItems: "center", boxShadow: "0 14px 34px -12px rgba(247,144,9,0.6)" }}>
              <Person size={rmSize * 0.56} color="#fff" />
            </div>
          </div>
        </Appear>

        {/* the climbing ratio + shrinking attention */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 24 }}>
          <Appear at={16}>
            <div>
              <div style={{ fontSize: 120, fontWeight: 300, letterSpacing: "-0.02em", color: COLORS.ink, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                1 <span style={{ color: COLORS.inkFaint }}>:</span> {clients}
              </div>
              <div style={{ marginTop: 8, fontSize: 24, fontWeight: 600, letterSpacing: "0.08em", color: COLORS.inkSoft }}>
                CLIENTS ON ONE RM
              </div>
            </div>
          </Appear>

          <Appear at={40}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
              <span style={{ fontSize: 54, fontWeight: 600, color: COLORS.warning, fontVariantNumeric: "tabular-nums" }}>
                ≈ {minutes} min
              </span>
              <span style={{ fontSize: 24, color: COLORS.inkSoft }}>of real attention, each — and falling.</span>
            </div>
          </Appear>

          <Appear at={56}>
            <div style={{ fontSize: 28, lineHeight: 1.45, color: COLORS.inkSoft, maxWidth: 600 }}>
              Every client the book adds <strong style={{ color: COLORS.ink, fontWeight: 600 }}>steals minutes from the rest</strong>.
              Bespoke, values-aware advice can&rsquo;t scale by hand.
            </div>
          </Appear>
        </div>
      </div>
    </Stage>
  );
};

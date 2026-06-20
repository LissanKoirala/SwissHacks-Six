import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { Appear, Card, Chip, Headline, HL, Stage } from "../../ui";
import { COLORS } from "../../theme";
import { WORKFLOW } from "../../content";

const C = WORKFLOW.classify;
const TOPICS = ["us-tech / AI", "deforestation", "labour-governance", "neuro-research"];

export const WfClassify: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  // sentiment needle sweeps to the real score
  const t = interpolate(frame, [40, 80], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const val = C.score * t; // -0.62 target
  const TRACK = 900;
  const half = TRACK / 2;
  const fill = Math.abs(val) * half;

  return (
    <Stage dur={dur} kicker="Classify once">
      <Appear at={8}>
        <Headline size={60}>
          Read the article — <HL>sentiment</HL> and <HL>topic</HL>, in one pass.
        </Headline>
      </Appear>

      {/* sentiment gauge */}
      <Appear at={26} style={{ marginTop: 48 }}>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "0.06em", color: COLORS.inkSoft }}>
          SENTIMENT
        </div>
        <div style={{ position: "relative", width: TRACK, height: 18, marginTop: 18, background: "#f0f0f0", borderRadius: 999 }}>
          {/* centre tick */}
          <div style={{ position: "absolute", left: half - 1, top: -10, width: 2, height: 38, background: COLORS.inkFaint }} />
          {/* fill from centre to the left (bearish = destructive) */}
          <div
            style={{
              position: "absolute",
              top: 0,
              height: 18,
              borderRadius: 999,
              background: COLORS.destructive,
              left: half - fill,
              width: fill,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: -9,
              left: half - fill - 18,
              width: 36,
              height: 36,
              borderRadius: 999,
              background: COLORS.destructive,
              boxShadow: "0 4px 14px -4px rgba(231,0,11,0.6)",
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", width: TRACK, marginTop: 12, fontSize: 22, color: COLORS.inkFaint }}>
          <span>bearish −1.0</span>
          <span>neutral</span>
          <span>bullish +1.0</span>
        </div>
        <div style={{ marginTop: 18 }}>
          <Chip tone="destructive" size={26}>
            {C.sentiment} {val.toFixed(2)}
          </Chip>
        </div>
      </Appear>

      {/* topic classification */}
      <Appear at={70} style={{ marginTop: 44 }}>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "0.06em", color: COLORS.inkSoft }}>
          TOPIC
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 14, flexWrap: "wrap" }}>
          {TOPICS.map((t2) => {
            const on = t2 === "neuro-research";
            return (
              <span
                key={t2}
                style={{
                  padding: "12px 22px",
                  borderRadius: 999,
                  fontSize: 26,
                  fontWeight: 600,
                  background: on ? COLORS.primarySubtle : "#f5f5f5",
                  color: on ? COLORS.primary : COLORS.inkFaint,
                  boxShadow: on ? `inset 0 0 0 2px #bcd9ff` : `inset 0 0 0 1.5px ${COLORS.border}`,
                }}
              >
                {on ? C.topic : t2}
              </span>
            );
          })}
        </div>
      </Appear>

      <Appear at={92} style={{ marginTop: 28 }}>
        <Card style={{ display: "inline-block" }}>
          <span style={{ fontSize: 24, color: COLORS.inkSoft }}>
            Tagged <strong style={{ color: COLORS.ink, fontWeight: 700 }}>once</strong> — and reused across the whole book. No per-client model calls.
          </span>
        </Card>
      </Appear>
    </Stage>
  );
};

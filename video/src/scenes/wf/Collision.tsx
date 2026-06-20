import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { Appear, Card, Headline, HL, ProvPill, Stage } from "../../ui";
import { COLORS } from "../../theme";
import { WORKFLOW } from "../../content";

const CO = WORKFLOW.collision;

const Node: React.FC<{ kicker: string; title: string; sub: string; tint: string }> = ({ kicker, title, sub, tint }) => (
  <Card style={{ width: 560 }}>
    <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.12em", color: tint }}>{kicker}</div>
    <div style={{ marginTop: 10, fontSize: 34, fontWeight: 600, color: COLORS.ink }}>{title}</div>
    <div style={{ marginTop: 8, fontSize: 25, color: COLORS.inkSoft }}>{sub}</div>
  </Card>
);

export const WfCollision: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const pop = interpolate(frame, [60, 74, 82], [0.4, 1.12, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const popO = interpolate(frame, [60, 74], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <Stage dur={dur} kicker="Match — set intersection, no LLM">
      <Appear at={8}>
        <Headline size={62}>
          The topic <HL>collides</HL> with what we know about the client.
        </Headline>
      </Appear>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 40, position: "relative" }}>
        <Appear at={24}>
          <Node kicker="NEWS · TOPIC" title="Neurodegenerative research" sub="Biogen · bearish −0.62" tint={COLORS.warning} />
        </Appear>

        {/* the intersection stamp */}
        <div
          style={{
            transform: `scale(${pop})`,
            opacity: popO,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 64, color: COLORS.destructive }}>✕</div>
          <div
            style={{
              padding: "8px 20px",
              borderRadius: 999,
              background: "#fde8e9",
              color: COLORS.destructive,
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: "0.1em",
            }}
          >
            CONFLICT
          </div>
        </div>

        <Appear at={40}>
          <Node kicker="CLIENT · INTEREST" title={CO.client} sub={CO.stance} tint={COLORS.primary} />
        </Appear>
      </div>

      <Appear at={86} style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 27, color: COLORS.ink }}>{CO.holding} — directly affected.</span>
          <ProvPill label="stance" id={CO.source} />
        </div>
      </Appear>
    </Stage>
  );
};

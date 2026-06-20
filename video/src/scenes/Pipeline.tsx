import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { Appear, FlowArrow, Headline, HL, Stage } from "../ui";
import { COLORS } from "../theme";

const NODES = [
  { t: "Capture", s: "voice · photo · text" },
  { t: "Profile", s: "four facets" },
  { t: "Topic index", s: "meta graph" },
  { t: "Match", s: "set intersection" },
  { t: "Strategy + Dialogue", s: "for the RM" },
];

const Node: React.FC<{ t: string; s: string; on: boolean }> = ({ t, s, on }) => (
  <div
    style={{
      padding: "26px 30px",
      borderRadius: 16,
      background: on ? COLORS.primarySubtle : COLORS.card,
      boxShadow: `inset 0 0 0 2px ${on ? "#bcd9ff" : COLORS.border}`,
      minWidth: 230,
    }}
  >
    <div style={{ fontSize: 32, fontWeight: 700, color: on ? COLORS.primary : COLORS.ink }}>{t}</div>
    <div style={{ marginTop: 6, fontSize: 22, color: COLORS.inkSoft }}>{s}</div>
  </div>
);

export const PipelineScene: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const NODE_AT = [18, 48, 78, 108, 138];
  return (
    <Stage dur={dur} kicker="How it works">
      <Appear at={8}>
        <Headline size={72}>
          Classify once. <HL>Match for free</HL>. Reason only on the real hits.
        </Headline>
      </Appear>

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: 18,
          flexWrap: "nowrap",
          marginTop: 24,
        }}
      >
        {NODES.map((n, i) => (
          <React.Fragment key={n.t}>
            <Appear at={NODE_AT[i]} y={16}>
              <Node t={n.t} s={n.s} on={frame >= NODE_AT[i]} />
            </Appear>
            {i < NODES.length - 1 ? (
              <FlowArrow
                progress={interpolate(
                  frame,
                  [NODE_AT[i] + 14, NODE_AT[i] + 30],
                  [0, 1],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                )}
              />
            ) : null}
          </React.Fragment>
        ))}
      </div>

      <Appear at={158} style={{ marginTop: 8 }}>
        <div style={{ fontSize: 30, color: COLORS.inkSoft }}>
          A match is a <strong style={{ color: COLORS.ink, fontWeight: 600 }}>shared topic node</strong> — an
          index lookup, never an LLM call per client.
        </div>
      </Appear>
    </Stage>
  );
};

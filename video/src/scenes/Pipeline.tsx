import React from "react";
import { Appear, Card, Headline, HL, MetaChip, Stage } from "../ui";
import { COLORS } from "../theme";

const PRINCIPLES = [
  { t: "Classify & embed once", s: "cached on the item — never re-run per client" },
  { t: "Matching is free", s: "a set-intersection index lookup · zero LLM calls" },
  { t: "Reason only on real hits", s: "the strong model runs lazily, cached per (client, item)" },
];

export const PipelineScene: React.FC<{ dur: number }> = ({ dur }) => {
  return (
    <Stage dur={dur} kicker="Efficiency · token discipline">
      <Appear at={8}>
        <Headline size={62}>
          We never re-process. <HL>Classify once</HL>, match for free.
        </Headline>
      </Appear>

      {/* the contrast: naive reprocessing vs. our pipeline */}
      <div style={{ marginTop: 40, display: "flex", gap: 28 }}>
        <Appear at={26} style={{ flex: 1, display: "flex" }}>
          <Card style={{ flex: 1, background: "#fdf0db", boxShadow: "inset 0 0 0 1.5px #f6d9a8" }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0.06em", color: "#b5680a" }}>
              THE NAÏVE WAY
            </div>
            <div style={{ marginTop: 14, fontSize: 34, fontWeight: 600, color: COLORS.ink }}>
              Re-process every item, for every client, on every refresh.
            </div>
            <div style={{ marginTop: 14, fontSize: 26, color: COLORS.inkSoft }}>
              21 items × 4 clients × each run →{" "}
              <strong style={{ color: "#b5680a" }}>thousands of model calls.</strong> Cost grows
              with clients × items.
            </div>
          </Card>
        </Appear>

        <Appear at={42} style={{ flex: 1, display: "flex" }}>
          <Card style={{ flex: 1, background: COLORS.primarySubtle, boxShadow: "inset 0 0 0 1.5px #cfe2ff" }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0.06em", color: COLORS.primary }}>
              OUR PIPELINE
            </div>
            <div style={{ marginTop: 14, fontSize: 34, fontWeight: 600, color: COLORS.ink }}>
              Tag once, cache, and only reason over the real matches.
            </div>
            <div style={{ marginTop: 14, fontSize: 26, color: COLORS.inkSoft }}>
              21 items classified <strong style={{ color: COLORS.primary }}>once</strong> · matching
              is free · a handful reasoned, then cached.
            </div>
          </Card>
        </Appear>
      </div>

      {/* the three rules */}
      <div style={{ marginTop: 30, display: "flex", gap: 18 }}>
        {PRINCIPLES.map((p, i) => (
          <Appear key={p.t} at={62 + i * 12} style={{ flex: 1, display: "flex" }}>
            <div
              style={{
                flex: 1,
                borderRadius: 14,
                boxShadow: `inset 0 0 0 1.5px ${COLORS.border}`,
                padding: "18px 22px",
              }}
            >
              <div style={{ fontSize: 24, fontWeight: 600, color: COLORS.ink }}>{p.t}</div>
              <div style={{ marginTop: 6, fontSize: 20, lineHeight: 1.35, color: COLORS.inkSoft }}>{p.s}</div>
            </div>
          </Appear>
        ))}
      </div>

      <Appear at={104} style={{ marginTop: 26 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <MetaChip>cost ≈ items + real matches</MetaChip>
          <span style={{ fontSize: 28, color: COLORS.inkSoft }}>
            Token burn tracks <strong style={{ color: COLORS.ink, fontWeight: 600 }}>new information</strong>,
            not the number of clients — so it stays flat as the book grows.
          </span>
        </div>
      </Appear>
    </Stage>
  );
};

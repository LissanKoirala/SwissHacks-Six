import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { Appear, FlowArrow, Headline, HL, ProvPill, Stage } from "../ui";
import { COLORS } from "../theme";

const CHAIN: { label: string; id: string }[] = [
  { label: "CRM log line", id: "schneider#…#22" },
  { label: "Topic", id: "neuro-research" },
  { label: "News", id: "esg:pharma-cut" },
  { label: "Swap", id: "cio_list" },
];

export const TrustScene: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const AT = [40, 78, 116, 154];
  return (
    <Stage dur={dur} kicker="Trust & explainability · 25% of the score">
      <Appear at={8}>
        <Headline size={84}>
          If we can't <HL>cite it</HL>, we don't surface it.
        </Headline>
      </Appear>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "nowrap" }}>
          {CHAIN.map((c, i) => (
            <React.Fragment key={c.label}>
              <Appear at={AT[i]} y={14}>
                <ProvPill label={c.label} id={c.id} />
              </Appear>
              {i < CHAIN.length - 1 ? (
                <FlowArrow
                  width={64}
                  progress={interpolate(frame, [AT[i] + 12, AT[i] + 26], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  })}
                />
              ) : null}
            </React.Fragment>
          ))}
        </div>
        <Appear at={AT[3] + 24} style={{ marginTop: 40 }}>
          <div style={{ fontSize: 30, color: COLORS.inkSoft }}>
            Every fact, alert and suggestion is one click from its source. The explanation{" "}
            <strong style={{ color: COLORS.ink, fontWeight: 600 }}>is</strong> the provenance chain.
          </div>
        </Appear>
      </div>
    </Stage>
  );
};

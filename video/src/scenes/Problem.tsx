import React from "react";
import { Appear, Headline, HL, Stage, Sub } from "../ui";
import { COLORS } from "../theme";

const PAINS = [
  "A private client expects bespoke, values-aware advice.",
  "One relationship manager covers dozens of them.",
  "Attention doesn't divide cleanly — it dilutes.",
];

export const ProblemScene: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker="The problem">
    <Appear at={8}>
      <Headline size={74}>
        Billionaires get a dedicated team. <HL>Everyone else</HL> gets a sliver of an RM.
      </Headline>
    </Appear>
    <div style={{ marginTop: 60, display: "flex", flexDirection: "column", gap: 26 }}>
      {PAINS.map((p, i) => (
        <Appear key={p} at={32 + i * 18}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <span
              style={{ width: 14, height: 14, borderRadius: 999, background: COLORS.inkFaint, flexShrink: 0 }}
            />
            <Sub style={{ fontSize: 38, color: COLORS.ink }}>{p}</Sub>
          </div>
        </Appear>
      ))}
    </div>
  </Stage>
);

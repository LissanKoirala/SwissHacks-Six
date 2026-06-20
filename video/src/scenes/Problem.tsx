import React from "react";
import { Appear, Headline, Stage, Sub } from "../ui";
import { COLORS } from "../theme";

const PAINS = [
  "Three years of CRM history, buried in meeting notes.",
  "Markets, news and filings move every single day.",
  "Personalised, values-aligned advice doesn't scale.",
];

export const ProblemScene: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker="The problem">
    <Appear at={8}>
      <Headline size={78}>Every client is different. The world never stops.</Headline>
    </Appear>
    <div style={{ marginTop: 64, display: "flex", flexDirection: "column", gap: 28 }}>
      {PAINS.map((p, i) => (
        <Appear key={p} at={32 + i * 18}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: 999,
                background: COLORS.inkFaint,
                flexShrink: 0,
              }}
            />
            <Sub style={{ fontSize: 38, color: COLORS.ink }}>{p}</Sub>
          </div>
        </Appear>
      ))}
    </div>
  </Stage>
);

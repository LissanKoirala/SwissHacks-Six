import React from "react";
import { Appear, Headline, HL, Stage, Sub } from "../ui";
import { COLORS } from "../theme";

export const TitleScene: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker="SwissHacks · SIX / Noumena / NTT DATA">
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <Appear at={10}>
        <Headline size={104}>
          The next generation of
          <br />
          <HL>wealth advisory</HL>.
        </Headline>
      </Appear>
      <Appear at={28} style={{ marginTop: 44 }}>
        <Sub>
          The <strong style={{ color: COLORS.ink, fontWeight: 600 }}>Advisory Workbench</strong> —
          an AI co-pilot for the relationship manager.
        </Sub>
      </Appear>
    </div>
  </Stage>
);

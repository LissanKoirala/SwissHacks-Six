import React from "react";
import { Appear, Headline, HL, Stage, Sub } from "../ui";
import { COLORS } from "../theme";
import { BRAND } from "../content";

export const TitleScene: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker={BRAND.credit} showWordmark={false}>
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <Appear at={10}>
        <Headline size={132}>
          Everyone&rsquo;s a
          <br />
          <HL>Billionaire</HL>.
        </Headline>
      </Appear>
      <Appear at={30} style={{ marginTop: 48 }}>
        <Sub>
          Billionaires get a dedicated team and bespoke, values-aware advice. This gives{" "}
          <strong style={{ color: COLORS.ink, fontWeight: 600 }}>every</strong> client that
          treatment — without dividing the RM&rsquo;s attention.
        </Sub>
      </Appear>
    </div>
  </Stage>
);

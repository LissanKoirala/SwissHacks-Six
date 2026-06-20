import React from "react";
import { Appear, Card, Chip, Headline, HL, ProvPill, Stage } from "../ui";
import { COLORS } from "../theme";

export const TwinScene: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker="Client digital twin">
    <Appear at={8}>
      <Headline size={76}>
        Predict the client's reaction — <HL>before you raise it</HL>.
      </Headline>
    </Appear>

    <div style={{ marginTop: 52, display: "flex", gap: 32, flex: 1 }}>
      <Appear at={30} style={{ flex: 1, display: "flex" }}>
        <Card style={{ flex: 1, display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Chip tone="warning">Likely to push back</Chip>
            <Chip>medium confidence</Chip>
          </div>
          <div style={{ fontSize: 30, lineHeight: 1.35, color: COLORS.ink }}>
            “This buys into US mega-cap software — which cuts against their stance on US tech / AI.”
          </div>
          <ProvPill label="why" id="raeber#…#08" />
        </Card>
      </Appear>

      <Appear at={48} style={{ flex: 1, display: "flex" }}>
        <Card style={{ flex: 1, display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.ink }}>Ask the twin anything</div>
          <div style={{ fontSize: 28, lineHeight: 1.4, color: COLORS.inkSoft }}>
            “How would she feel about trimming the tech sleeve?” — answered from her cited profile.
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, color: COLORS.primary, letterSpacing: "0.08em" }}>
            TURN IT INTO →
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Chip tone="primary">Email</Chip>
            <Chip tone="primary">SMS</Chip>
            <Chip tone="primary">WhatsApp</Chip>
            <Chip tone="primary">Talking points</Chip>
          </div>
        </Card>
      </Appear>
    </div>
  </Stage>
);

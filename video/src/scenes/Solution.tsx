import React from "react";
import { Appear, Card, Headline, HL, Stage, Sub } from "../ui";
import { COLORS } from "../theme";

const Output: React.FC<{ title: string; body: string; n: string }> = ({ title, body, n }) => (
  <Card style={{ flex: 1 }}>
    <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0.12em", color: COLORS.primary }}>
      {n}
    </div>
    <div style={{ marginTop: 14, fontSize: 40, fontWeight: 600, color: COLORS.ink }}>{title}</div>
    <div style={{ marginTop: 12, fontSize: 28, lineHeight: 1.4, color: COLORS.inkSoft }}>{body}</div>
  </Card>
);

export const SolutionScene: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker="The solution">
    <Appear at={8}>
      <Headline size={74}>
        Give every client the <HL>billionaire treatment</HL>.
      </Headline>
    </Appear>

    <div style={{ marginTop: 56, display: "flex", gap: 32 }}>
      <Appear at={30} style={{ flex: 1, display: "flex" }}>
        <Output
          n="OUTPUT 1"
          title="Strategy proposal"
          body="Same-sector, in-mandate swaps — limited to CIO-approved, sentiment-screened names."
        />
      </Appear>
      <Appear at={44} style={{ flex: 1, display: "flex" }}>
        <Output
          n="OUTPUT 2"
          title="Dialogue suggestion"
          body="A ready conversation in the client's voice, mixing their signals with light market context."
        />
      </Appear>
    </div>

    <Appear at={64} style={{ marginTop: 48 }}>
      <Sub style={{ fontSize: 34 }}>
        The workbench watches the world for each client — the RM gives undivided attention.{" "}
        <strong style={{ color: COLORS.ink, fontWeight: 600 }}>The RM approves. The client decides.</strong>
      </Sub>
    </Appear>
  </Stage>
);

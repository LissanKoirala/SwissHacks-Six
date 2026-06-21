import React from "react";
import { Appear, Headline, HL, Stage, Sub, TeamCluster } from "../ui";
import { COLORS } from "../theme";

const CLIENTS = [
  { initials: "HS", name: "Schneider" },
  { initials: "MH", name: "Huber" },
  { initials: "ER", name: "Räber" },
  { initials: "JA", name: "Ammann" },
];
const ROLES = ["News", "Strategy", "Dialogue", "Plan"];

export const SolutionScene: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker="The solution">
    <Appear at={8}>
      <Headline size={60}>
        Give <HL>every</HL> client the billionaire treatment.
      </Headline>
    </Appear>

    {/* one AI team per client, replicated across the book */}
    <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 8, flex: 1, alignItems: "center" }}>
      {CLIENTS.map((c, i) => (
        <Appear key={c.initials} at={28 + i * 16} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <TeamCluster size={360} roles={ROLES} at={34 + i * 16} centerLabel={c.initials} pillFont={15} />
          <div style={{ fontSize: 24, fontWeight: 600, color: COLORS.ink }}>{c.name}</div>
        </Appear>
      ))}
    </div>

    <Appear at={96} style={{ marginTop: 8 }}>
      <Sub style={{ fontSize: 32, maxWidth: 1500 }}>
        An AI team for each — it watches the world, proposes the move and drafts the conversation.{" "}
        <strong style={{ color: COLORS.ink, fontWeight: 600 }}>The RM approves. The client decides.</strong>
      </Sub>
    </Appear>
  </Stage>
);

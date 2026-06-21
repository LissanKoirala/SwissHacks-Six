import React from "react";
import { Appear, Headline, HL, Stage, Sub, TeamCluster } from "../ui";
import { COLORS } from "../theme";

// the same six specialists from the title slide, on every client
const ROLES = ["News", "Profile", "Strategy", "Dialogue", "Rendezvous", "Risk"];
const CLIENTS = [1, 2, 3, 4];

export const SolutionScene: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker="The solution">
    <Appear at={8}>
      <Headline size={58}>
        Give <HL>every</HL> client the billionaire treatment.
      </Headline>
    </Appear>

    {/* one AI team — all six specialists — replicated per client */}
    <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", gap: 4, flex: 1, alignItems: "center" }}>
      {CLIENTS.map((c, i) => (
        <Appear key={c} at={28 + i * 14} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <TeamCluster size={384} roles={ROLES} at={34 + i * 14} pillFont={13} />
          <div style={{ fontSize: 22, fontWeight: 600, color: COLORS.ink }}>Client {c}</div>
        </Appear>
      ))}
    </div>

    <Appear at={92} style={{ marginTop: 4 }}>
      <Sub style={{ fontSize: 30, maxWidth: 1520 }}>
        Six specialists on each — watching the world, knowing them, proposing the move, drafting the
        conversation. <strong style={{ color: COLORS.ink, fontWeight: 600 }}>The RM approves. The client decides.</strong>
      </Sub>
    </Appear>
  </Stage>
);

import React from "react";
import { Appear, Headline, HL, Stage, Sub, TeamCluster } from "../ui";
import { COLORS } from "../theme";
import { BRAND } from "../content";

const ROLES = ["News watch", "Profile", "Strategy", "Dialogue", "Rendezvous", "Risk"];

export const TitleScene: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker={BRAND.credit} showWordmark={false}>
    <div style={{ display: "flex", alignItems: "center", flex: 1, gap: 40 }}>
      {/* the hook */}
      <div style={{ flex: 1.1 }}>
        <Appear at={10}>
          <Headline size={112}>
            Everyone&rsquo;s a
            <br />
            <HL>Billionaire</HL>.
          </Headline>
        </Appear>
        <Appear at={30} style={{ marginTop: 40 }}>
          <Sub style={{ maxWidth: 760 }}>
            Give the RM a full team — researcher, analyst, scribe, planner —{" "}
            <strong style={{ color: COLORS.ink, fontWeight: 600 }}>on every client</strong>.
          </Sub>
        </Appear>
      </div>

      {/* a dedicated team clustered around one client */}
      <Appear at={26} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
        <TeamCluster size={620} roles={ROLES} at={34} />
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "0.12em", color: COLORS.inkSoft }}>
          ONE CLIENT · A FULL TEAM
        </div>
      </Appear>
    </div>
  </Stage>
);

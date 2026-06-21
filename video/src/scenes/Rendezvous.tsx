import React from "react";
import { Appear, Headline, HL, MetaChip, Screenshot, Stage } from "../ui";
import { COLORS } from "../theme";
import { RENDEZVOUS as RV } from "../content";

// rendezvous_full.png is a 3360×2100 viewport grab (ratio 0.625).
const SHOT_RATIO = 2100 / 3360;

export const RendezvousScene: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker="Rendezvous · plan the meeting">
    <Appear at={8}>
      <Headline size={54}>
        When it&rsquo;s time to meet, <HL>plan it around what they love</HL>.
      </Headline>
    </Appear>

    <div style={{ marginTop: 30, display: "flex", gap: 40, alignItems: "center", flex: 1 }}>
      {/* the real planner screen */}
      <Appear at={22}>
        <Screenshot src="shots/rendezvous_full.png" width={1120} ratio={SHOT_RATIO} />
      </Appear>

      {/* what it's doing, beside the shot */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
        <Appear at={40}>
          <div style={{ fontSize: 26, lineHeight: 1.45, color: COLORS.inkSoft }}>
            The live planner — interests lifted from his record, grounded venue
            suggestions, and the fairest or greenest place to convene.
          </div>
        </Appear>
        <Appear at={54}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {RV.optimiser.chips.map((c) => (
              <MetaChip key={c}>{c}</MetaChip>
            ))}
          </div>
        </Appear>
        <Appear at={66}>
          <div style={{ fontSize: 22, color: COLORS.inkFaint }}>
            Travel grounded in live routes — a day/night globe, not a guess.
          </div>
        </Appear>
      </div>
    </div>
  </Stage>
);

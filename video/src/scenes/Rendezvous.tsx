import React from "react";
import { Appear, Headline, HL, MetaChip, Screenshot, Stage } from "../ui";
import { COLORS } from "../theme";

// rendezvous_schneider.png is the real planner minus the sidebar (1432×1080),
// using Schneider — a Zürich↔New York trip that shows clearly on the globe.
const SHOT_RATIO = 1080 / 1432;

const POINTS = [
  "Activities tuned to his tastes — lifted straight from his record.",
  "The meeting placed in the fairest, lowest-carbon city for everyone.",
  "Travel grounded in live flight routes — you can see the trip on the globe.",
];

export const RendezvousScene: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker="Rendezvous · plan the meeting">
    <Appear at={8}>
      <Headline size={52}>
        When it&rsquo;s time to meet, <HL>plan it around what they love</HL>.
      </Headline>
    </Appear>

    <div style={{ marginTop: 26, display: "flex", gap: 44, alignItems: "center", flex: 1 }}>
      {/* the real planner — Schneider's transatlantic route on the globe */}
      <Appear at={22}>
        <Screenshot src="shots/rendezvous_schneider.png" width={900} ratio={SHOT_RATIO} />
      </Appear>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
        {POINTS.map((p, i) => (
          <Appear key={p} at={38 + i * 12}>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <span style={{ marginTop: 12, width: 10, height: 10, borderRadius: 999, background: COLORS.primary, flexShrink: 0 }} />
              <span style={{ fontSize: 26, lineHeight: 1.4, color: COLORS.inkSoft }}>{p}</span>
            </div>
          </Appear>
        ))}
        <Appear at={78} style={{ marginTop: 8 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <MetaChip>New York · fairest for all</MetaChip>
            <MetaChip>320 kg CO₂</MetaChip>
            <MetaChip>3 flights</MetaChip>
          </div>
        </Appear>
      </div>
    </div>
  </Stage>
);

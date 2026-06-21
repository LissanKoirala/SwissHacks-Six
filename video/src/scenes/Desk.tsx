import React from "react";
import { Appear, Headline, HL, MetaChip, Screenshot, Stage } from "../ui";
import { COLORS } from "../theme";

// overview_content.png is the real home page minus the sidebar (1432×1080).
const SHOT_RATIO = 1080 / 1432;

export const DeskScene: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker="The morning desk">
    <Appear at={8}>
      <Headline size={56}>
        Your whole book, <HL>triaged before 9am</HL>.
      </Headline>
    </Appear>

    <div style={{ marginTop: 28, display: "flex", gap: 44, alignItems: "center", flex: 1 }}>
      {/* the real overview screen */}
      <Appear at={22}>
        <Screenshot src="shots/overview_content.png" width={900} ratio={SHOT_RATIO} />
      </Appear>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
        <Appear at={40}>
          <div style={{ fontSize: 27, lineHeight: 1.45, color: COLORS.inkSoft }}>
            One glance across every client — the priority touch-bases, today&rsquo;s meetings, and
            the market &amp; portfolio events that hit their profiles overnight.
          </div>
        </Appear>
        <Appear at={54}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <MetaChip>11 priority tasks</MetaChip>
            <MetaChip>4 meetings</MetaChip>
            <MetaChip>CHF 41.4M under advice</MetaChip>
          </div>
        </Appear>
        <Appear at={66}>
          <div style={{ fontSize: 22, color: COLORS.inkFaint }}>
            Already worked and ranked — every card one click from its source.
          </div>
        </Appear>
      </div>
    </div>
  </Stage>
);

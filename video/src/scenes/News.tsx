import React from "react";
import { Appear, Headline, HL, MetaChip, Screenshot, Stage } from "../ui";
import { COLORS } from "../theme";

// newsfeed.png is the real News feed straight from the app (2104×1522).
const SHOT_RATIO = 1522 / 2104;

export const NewsScene: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker="News & signal watch">
    <Appear at={8}>
      <Headline size={56}>
        We read the world <HL>once</HL> — and tag it to who it touches.
      </Headline>
    </Appear>

    <div style={{ marginTop: 26, display: "flex", gap: 44, alignItems: "center", flex: 1 }}>
      {/* the real news feed */}
      <Appear at={22}>
        <Screenshot src="shots/newsfeed.png" width={900} ratio={SHOT_RATIO} />
      </Appear>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
        <Appear at={40}>
          <div style={{ fontSize: 27, lineHeight: 1.45, color: COLORS.inkSoft }}>
            News, SEC filings, ESG and macro — every item tagged with{" "}
            <strong style={{ color: COLORS.ink, fontWeight: 600 }}>sentiment, topic and source</strong>{" "}
            the moment it lands.
          </div>
        </Appear>
        <Appear at={54}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <MetaChip>Event Registry</MetaChip>
            <MetaChip>SEC filings</MetaChip>
            <MetaChip>Macro</MetaChip>
            <MetaChip>ESG</MetaChip>
          </div>
        </Appear>
        <Appear at={66}>
          <div style={{ fontSize: 22, color: COLORS.inkFaint }}>
            Classified <strong style={{ color: COLORS.ink, fontWeight: 600 }}>once</strong> — then
            matched to every client&rsquo;s profile for free.
          </div>
        </Appear>
      </div>
    </div>
  </Stage>
);

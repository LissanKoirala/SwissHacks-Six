import React from "react";
import { Appear, Card, Chip, Headline, HL, MetaChip, Stage } from "../ui";
import { COLORS } from "../theme";
import { NEWS } from "../content";

const SENT = { BULLISH: "success", BEARISH: "destructive", NEUTRAL: "neutral" } as const;

const Item: React.FC<{ it: (typeof NEWS.items)[number] }> = ({ it }) => (
  <Card style={{ display: "flex", alignItems: "center", gap: 18, padding: 22 }}>
    <span
      style={{
        fontSize: 18,
        fontWeight: 700,
        letterSpacing: "0.1em",
        color: COLORS.inkSoft,
        minWidth: 130,
      }}
    >
      {it.type}
    </span>
    <Chip tone={SENT[it.sentiment]} size={22}>
      {it.sentiment} {it.score}
    </Chip>
    <span style={{ flex: 1, fontSize: 27, color: COLORS.ink }}>{it.title}</span>
    <MetaChip>{it.topic}</MetaChip>
  </Card>
);

export const NewsScene: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker="News & signal watch">
    <Appear at={8}>
      <Headline size={62}>
        We read the world <HL>once</HL> — and tag it to who it touches.
      </Headline>
    </Appear>

    {/* sources, classified once */}
    <Appear at={26} style={{ marginTop: 34 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {NEWS.sources.map((s) => (
          <MetaChip key={s.label}>
            {s.label} · <span style={{ color: COLORS.ink, fontWeight: 700 }}>{s.n}</span>
          </MetaChip>
        ))}
      </div>
    </Appear>

    {/* a few real, tagged items */}
    <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 14 }}>
      {NEWS.items.map((it, i) => (
        <Appear key={it.title} at={40 + i * 14}>
          <Item it={it} />
        </Appear>
      ))}
    </div>

    <Appear at={40 + NEWS.items.length * 14 + 8} style={{ marginTop: 24 }}>
      <div style={{ fontSize: 28, color: COLORS.inkSoft }}>
        <strong style={{ color: COLORS.ink, fontWeight: 600 }}>{NEWS.total} signals</strong> today
        across {NEWS.topics} topics — classified once, then matched to every client&rsquo;s profile
        for free. Sentiment and source travel with each item.
      </div>
    </Appear>
  </Stage>
);

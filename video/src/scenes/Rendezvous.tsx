import React from "react";
import { Appear, Card, Chip, Headline, HL, MetaChip, Stage } from "../ui";
import { COLORS } from "../theme";
import { RENDEZVOUS as RV } from "../content";

const Venue: React.FC<{ v: (typeof RV.venues)[number] }> = ({ v }) => (
  <Card style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{ fontSize: 28, fontWeight: 600, color: COLORS.ink, lineHeight: 1.25 }}>{v.title}</div>
    <div style={{ fontSize: 22, fontWeight: 600, color: COLORS.primary }}>
      {v.city} · {v.when}
    </div>
    <div style={{ fontSize: 23, lineHeight: 1.4, color: COLORS.inkSoft }}>{v.why}</div>
  </Card>
);

export const RendezvousScene: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker="Rendezvous · plan the meeting">
    <Appear at={8}>
      <Headline size={58}>
        When it&rsquo;s time to meet, <HL>plan it around what they love</HL>.
      </Headline>
    </Appear>

    {/* interests, lifted from the CRM */}
    <Appear at={24} style={{ marginTop: 30 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.1em", color: COLORS.inkSoft }}>
          FROM HIS RECORD
        </span>
        {RV.interests.map((i) => (
          <Chip key={i} tone="primary" size={24}>
            {i}
          </Chip>
        ))}
      </div>
    </Appear>

    {/* grounded venue suggestions */}
    <div style={{ marginTop: 22, display: "flex", gap: 20 }}>
      {RV.venues.map((v, i) => (
        <Appear key={v.title} at={38 + i * 12} style={{ flex: 1, display: "flex" }}>
          <Venue v={v} />
        </Appear>
      ))}
    </div>

    {/* the meeting optimiser */}
    <Appear at={84} style={{ marginTop: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          background: COLORS.primarySubtle,
          borderRadius: 16,
          padding: "20px 26px",
        }}
      >
        <span style={{ fontSize: 27, fontWeight: 600, color: COLORS.ink }}>{RV.optimiser.headline}</span>
        {RV.optimiser.chips.map((c) => (
          <MetaChip key={c}>{c}</MetaChip>
        ))}
        <span style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          {RV.optimiser.modes.map((m) => (
            <Chip key={m} size={22}>
              {m}
            </Chip>
          ))}
        </span>
      </div>
    </Appear>

    <Appear at={100} style={{ marginTop: 14 }}>
      <div style={{ fontSize: 26, color: COLORS.inkSoft }}>
        Fairest or greenest city for everyone, with {RV.optimiser.note} — travel grounded in live
        routes, not guesses.
      </div>
    </Appear>
  </Stage>
);

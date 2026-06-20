import React from "react";
import { Appear, Avatar, Card, Headline, HL, MetaChip, Stage } from "../ui";
import { COLORS } from "../theme";
import { DESK } from "../content";

const Row: React.FC<{ c: (typeof DESK)[number] }> = ({ c }) => {
  const dot = c.polarity === "conflict" ? COLORS.warning : COLORS.success;
  return (
    <Card style={{ display: "flex", alignItems: "center", gap: 22, padding: 24 }}>
      <Avatar name={c.name} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 30, fontWeight: 600, color: COLORS.ink }}>{c.name}</span>
          <MetaChip>{c.mandate}</MetaChip>
        </div>
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 12, fontSize: 25, color: COLORS.inkSoft }}>
          <span style={{ width: 11, height: 11, borderRadius: 999, background: dot, flexShrink: 0 }} />
          {c.note}
        </div>
      </div>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 18px",
          borderRadius: 999,
          background: COLORS.primarySubtle,
          color: COLORS.primary,
          fontSize: 24,
          fontWeight: 700,
        }}
      >
        {c.alerts} to review
      </span>
    </Card>
  );
};

export const DeskScene: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker="The morning desk">
    <Appear at={8}>
      <Headline size={66}>
        Your whole book, <HL>triaged before 9am</HL>.
      </Headline>
    </Appear>
    <div style={{ marginTop: 44, display: "flex", flexDirection: "column", gap: 18 }}>
      {DESK.map((c, i) => (
        <Appear key={c.name} at={26 + i * 14}>
          <Row c={c} />
        </Appear>
      ))}
    </div>
    <Appear at={26 + DESK.length * 14 + 8} style={{ marginTop: 26 }}>
      <div style={{ fontSize: 28, color: COLORS.inkSoft }}>
        Eleven signals across four clients — each matched to a profile, each one click from its source.
      </div>
    </Appear>
  </Stage>
);

import React from "react";
import { Appear, Card, Chip, Headline, MetaChip, PolarityChip, ProvPill, Stage } from "../ui";
import { COLORS } from "../theme";
import { SCHNEIDER } from "../content";

const S = SCHNEIDER;

export const StrategyScene: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker="Output 1 · Strategy proposal">
    <Appear at={8}>
      <Headline size={58}>Same-sector. Sentiment-screened. Inside the mandate.</Headline>
    </Appear>

    {/* the alert that triggered it */}
    <Appear at={26} style={{ marginTop: 36 }}>
      <Card style={{ display: "flex", alignItems: "center", gap: 20, borderRadius: 16 }}>
        <PolarityChip polarity={S.alert.polarity} />
        <span style={{ fontSize: 27, color: COLORS.ink, flex: 1 }}>{S.alert.text}</span>
        <ProvPill label="news" id={S.alert.source} />
      </Card>
    </Appear>

    {/* the proposed swap */}
    <Appear at={44} style={{ marginTop: 22 }}>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Chip tone="primary" size={26}>
            {S.swap.action}
          </Chip>
          <span style={{ fontSize: 40, fontWeight: 600, color: COLORS.ink }}>
            {S.swap.sell} <span style={{ color: COLORS.primary }}>→</span> {S.swap.buy}
          </span>
          <span style={{ marginLeft: "auto", fontSize: 34, fontWeight: 700, color: COLORS.ink }}>
            {S.swap.amount}
          </span>
        </div>

        <div style={{ marginTop: 22, fontSize: 26, lineHeight: 1.45, color: COLORS.inkSoft }}>
          {S.swap.rationale}
        </div>

        <div style={{ marginTop: 22, display: "flex", flexWrap: "wrap", gap: 12 }}>
          {S.swap.constraints.map((c) => (
            <MetaChip key={c}>{c}</MetaChip>
          ))}
        </div>

        <div style={{ marginTop: 22 }}>
          <ProvPill label="sources" id={S.swap.source} />
        </div>
      </Card>
    </Appear>
  </Stage>
);

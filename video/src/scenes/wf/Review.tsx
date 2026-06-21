import React from "react";
import { Appear, Card, Chip, Headline, HL, MetaChip, ProvPill, Stage } from "../../ui";
import { COLORS } from "../../theme";
import { SCHNEIDER } from "../../content";

const S = SCHNEIDER;

export const WfReview: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker="The RM opens it — review & approve">
    <Appear at={8}>
      <Headline size={56}>Everything ready — the swap, and the conversation.</Headline>
    </Appear>

    <div style={{ marginTop: 30, display: "flex", gap: 24, flex: 1 }}>
      {/* the proposed swap */}
      <Appear at={26} style={{ flex: 1, display: "flex" }}>
        <Card style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0.06em", color: COLORS.inkSoft }}>
            STRATEGY · awaiting approval
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Chip tone="primary" size={24}>
              {S.swap.action}
            </Chip>
            <span style={{ fontSize: 30, fontWeight: 600, color: COLORS.ink }}>
              {S.swap.sell} <span style={{ color: COLORS.primary }}>→</span> {S.swap.buy}
            </span>
            <span style={{ marginLeft: "auto", fontSize: 26, fontWeight: 700, color: COLORS.ink }}>{S.swap.amount}</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {S.swap.constraints.map((c) => (
              <MetaChip key={c}>{c}</MetaChip>
            ))}
          </div>
          <ProvPill label="sources" id={S.swap.source} />
        </Card>
      </Appear>

      {/* the drafted message */}
      <Appear at={42} style={{ flex: 1.1, display: "flex" }}>
        <Card style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0.06em", color: COLORS.inkSoft }}>
            DIALOGUE · in his voice
          </div>
          <div
            style={{
              fontSize: 25,
              lineHeight: 1.5,
              color: COLORS.ink,
              borderLeft: `4px solid ${COLORS.primary}`,
              paddingLeft: 20,
            }}
          >
            {S.dialogue.draft}
          </div>
        </Card>
      </Appear>
    </div>

    <Appear at={64} style={{ marginTop: 22 }}>
      <div style={{ fontSize: 28, color: COLORS.inkSoft }}>
        <HL>The agent proposes. The RM approves. The client decides.</HL>
      </div>
    </Appear>
  </Stage>
);

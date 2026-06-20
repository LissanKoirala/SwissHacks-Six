import React from "react";
import { Appear, Card, Headline, Stage } from "../ui";
import { COLORS } from "../theme";
import { SCHNEIDER } from "../content";

const S = SCHNEIDER;

export const DialogueScene: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker="Output 2 · Dialogue suggestion">
    <Appear at={8}>
      <Headline size={58}>A ready conversation — in the client&rsquo;s voice.</Headline>
    </Appear>

    {/* tone, learned from the relationship */}
    <Appear at={26} style={{ marginTop: 36 }}>
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "flex-start",
          background: COLORS.primarySubtle,
          borderRadius: 16,
          padding: "22px 26px",
        }}
      >
        <span
          style={{
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: COLORS.primary,
            paddingTop: 4,
          }}
        >
          TONE
        </span>
        <span style={{ fontSize: 27, lineHeight: 1.4, color: COLORS.ink }}>{S.dialogue.style}</span>
      </div>
    </Appear>

    <div style={{ marginTop: 22, display: "flex", gap: 24 }}>
      {/* talking points */}
      <Appear at={42} style={{ flex: 1, display: "flex" }}>
        <Card style={{ flex: 1 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: COLORS.ink, letterSpacing: "0.04em" }}>
            TALKING POINTS
          </div>
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 16 }}>
            {S.dialogue.points.map((p) => (
              <div key={p} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <span
                  style={{ marginTop: 12, width: 10, height: 10, borderRadius: 999, background: COLORS.primary, flexShrink: 0 }}
                />
                <span style={{ fontSize: 26, lineHeight: 1.4, color: COLORS.inkSoft }}>{p}</span>
              </div>
            ))}
          </div>
        </Card>
      </Appear>

      {/* the drafted message */}
      <Appear at={56} style={{ flex: 1.25, display: "flex" }}>
        <Card style={{ flex: 1 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: COLORS.ink, letterSpacing: "0.04em" }}>
            DRAFT MESSAGE
          </div>
          <div
            style={{
              marginTop: 18,
              fontSize: 26,
              lineHeight: 1.5,
              color: COLORS.ink,
              borderLeft: `4px solid ${COLORS.primary}`,
              paddingLeft: 22,
            }}
          >
            {S.dialogue.draft}
          </div>
        </Card>
      </Appear>
    </div>
  </Stage>
);

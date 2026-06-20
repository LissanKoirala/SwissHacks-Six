import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { Appear, Card, Chip, Headline, HL, ProvPill, Stage } from "../ui";
import { COLORS } from "../theme";
import { TWIN } from "../content";

const T = TWIN;

// A rubber-stamp that pops in: BOUNCED (red) / CLEARED (green).
const Stamp: React.FC<{ at: number; label: string; color: string }> = ({ at, label, color }) => {
  const f = useCurrentFrame() - at;
  const s = interpolate(f, [0, 9, 15], [0.5, 1.12, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const o = interpolate(f, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        top: 22,
        right: 26,
        transform: `rotate(-7deg) scale(${s})`,
        opacity: o,
        border: `4px solid ${color}`,
        color,
        borderRadius: 10,
        padding: "6px 18px",
        fontSize: 28,
        fontWeight: 800,
        letterSpacing: "0.14em",
      }}
    >
      {label}
    </div>
  );
};

const Move: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 30, fontWeight: 600, color: COLORS.ink, lineHeight: 1.3 }}>{children}</div>
);

export const TwinScene: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker="Client digital twin">
    <Appear at={8}>
      <Headline size={62}>
        It <HL>bounces a decision</HL> that breaks a value — then clears the fix.
      </Headline>
    </Appear>

    {/* the standing ethical concern it remembers */}
    <Appear at={24} style={{ marginTop: 30 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          background: "#f5f5f5",
          borderRadius: 14,
          padding: "16px 22px",
        }}
      >
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.1em", color: COLORS.inkSoft }}>
          ON RECORD
        </span>
        <span style={{ fontSize: 26, fontStyle: "italic", color: COLORS.ink, flex: 1 }}>
          “{T.concern.quote}”
        </span>
        <ProvPill label={T.client} id={`${T.concern.date}`} />
      </div>
    </Appear>

    <div style={{ marginTop: 24, display: "flex", alignItems: "stretch", gap: 22 }}>
      {/* attempt 1 — bounced */}
      <Appear at={40} style={{ flex: 1, display: "flex" }}>
        <Card style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", gap: 16 }}>
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.12em", color: COLORS.inkSoft }}>
            RM PROPOSES
          </span>
          <Move>{T.attempt1.move}</Move>
          <div>
            <Chip tone="destructive" size={24}>
              {T.attempt1.verdict}
            </Chip>
          </div>
          <div style={{ fontSize: 25, lineHeight: 1.4, color: COLORS.inkSoft }}>{T.attempt1.reason}</div>
          <div style={{ fontSize: 25, fontStyle: "italic", color: COLORS.ink }}>
            He&rsquo;d say: “{T.attempt1.says}”
          </div>
          <ProvPill label="why" id={T.attempt1.source} />
          <Stamp at={64} label="BOUNCED" color={COLORS.destructive} />
        </Card>
      </Appear>

      {/* the retry arrow */}
      <Appear at={84} style={{ display: "flex", alignItems: "center" }}>
        <div style={{ textAlign: "center", color: COLORS.primary }}>
          <div style={{ fontSize: 44, fontWeight: 700 }}>→</div>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "0.06em" }}>try better</div>
        </div>
      </Appear>

      {/* attempt 2 — cleared */}
      <Appear at={96} style={{ flex: 1, display: "flex" }}>
        <Card style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", gap: 16 }}>
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.12em", color: COLORS.inkSoft }}>
            RM PROPOSES
          </span>
          <Move>
            {T.attempt2.move}{" "}
            <span style={{ color: COLORS.inkSoft, fontWeight: 500 }}>· {T.attempt2.amount}</span>
          </Move>
          <div>
            <Chip tone="success" size={24}>
              {T.attempt2.verdict}
            </Chip>
          </div>
          <div style={{ fontSize: 25, lineHeight: 1.4, color: COLORS.inkSoft }}>{T.attempt2.reason}</div>
          <div style={{ flex: 1 }} />
          <ProvPill label="sources" id={T.attempt2.source} />
          <Stamp at={120} label="CLEARED" color={COLORS.success} />
        </Card>
      </Appear>
    </div>

    <Appear at={138} style={{ marginTop: 22 }}>
      <div style={{ fontSize: 26, color: COLORS.inkSoft }}>
        Ask the twin anything — and autoformat the reply into an email or text.
      </div>
    </Appear>
  </Stage>
);

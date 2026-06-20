import React from "react";
import { Appear, Headline, HL, Stage } from "../ui";
import { COLORS } from "../theme";

const STEPS: { tag: string; tone: string; text: string }[] = [
  { tag: "CRM", tone: COLORS.teal, text: "Schneider's foundation funds Parkinson's research." },
  { tag: "NEWS", tone: COLORS.warning, text: "A pharma holding shuts its neurodegenerative division." },
  { tag: "MATCH", tone: COLORS.primary, text: "Conflict surfaced against his profile — and cited." },
  { tag: "STRATEGY", tone: COLORS.success, text: "A same-sector, sentiment-screened swap, inside the mandate." },
  { tag: "DIALOGUE", tone: COLORS.purple, text: "A ready conversation, in his voice." },
];

const Step: React.FC<{ tag: string; tone: string; text: string; last: boolean }> = ({
  tag,
  tone,
  text,
  last,
}) => (
  <div style={{ display: "flex", gap: 26, alignItems: "stretch" }}>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <span style={{ width: 22, height: 22, borderRadius: 999, background: tone, flexShrink: 0 }} />
      {!last ? <span style={{ width: 3, flex: 1, background: COLORS.border, marginTop: 6 }} /> : null}
    </div>
    <div style={{ paddingBottom: last ? 0 : 30 }}>
      <span
        style={{
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: "0.16em",
          color: tone,
        }}
      >
        {tag}
      </span>
      <div style={{ fontSize: 38, fontWeight: 500, color: COLORS.ink, marginTop: 4 }}>{text}</div>
    </div>
  </div>
);

export const SchneiderScene: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker="One thread, end to end">
    <Appear at={8}>
      <Headline size={64}>
        The <HL>Schneider</HL> slice — every box, in one trigger.
      </Headline>
    </Appear>

    <div style={{ marginTop: 48 }}>
      {STEPS.map((s, i) => (
        <Appear key={s.tag} at={34 + i * 42} y={18}>
          <Step tag={s.tag} tone={s.tone} text={s.text} last={i === STEPS.length - 1} />
        </Appear>
      ))}
    </div>
  </Stage>
);

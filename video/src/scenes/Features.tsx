import React from "react";
import { Appear, Card, Headline, Stage } from "../ui";
import { COLORS } from "../theme";

const FEATURES: { t: string; s: string }[] = [
  { t: "Multimodal capture", s: "Voice, photo (OCR) or text → a confirmed, immutable log." },
  { t: "Risk timeline", s: "Replays the relationship; shows what the desk knew, when." },
  { t: "Importance weighting", s: "The RM ranks what matters; it flows into matching." },
  { t: "Token discipline", s: "Classify once, cache; the strong model runs only on real hits." },
  { t: "Same-sector swaps", s: "Constrained to the CIO universe and the ±2.0pp drift rule." },
  { t: "Good-news briefings", s: "Authentic, values-aligned framing on opportunity matches." },
];

export const FeaturesScene: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker="Under the hood">
    <Appear at={8}>
      <Headline size={70}>Built for the desk — and for the judges.</Headline>
    </Appear>

    <div
      style={{
        marginTop: 52,
        flex: 1,
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 28,
        alignContent: "center",
      }}
    >
      {FEATURES.map((f, i) => (
        <Appear key={f.t} at={26 + i * 12}>
          <Card style={{ height: "100%" }}>
            <div style={{ fontSize: 32, fontWeight: 600, color: COLORS.ink }}>{f.t}</div>
            <div style={{ marginTop: 12, fontSize: 25, lineHeight: 1.4, color: COLORS.inkSoft }}>
              {f.s}
            </div>
          </Card>
        </Appear>
      ))}
    </div>
  </Stage>
);

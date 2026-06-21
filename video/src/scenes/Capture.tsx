import React from "react";
import { Appear, Headline, HL, Screenshot, Stage } from "../ui";
import { COLORS } from "../theme";

// voice_question.png 2208×1912 (ratio 0.866); voice_sentiment.png 2148×140 (0.065).
const Q_RATIO = 1912 / 2208;
const S_RATIO = 140 / 2148;

export const CaptureScene: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker="Capture · voice note-taking">
    <Appear at={8}>
      <Headline size={54}>
        After the meeting, just <HL>talk</HL> — it asks, then reads the sentiment.
      </Headline>
    </Appear>

    <div style={{ marginTop: 28, display: "flex", gap: 44, alignItems: "center", flex: 1 }}>
      {/* the real voice-interview panel asking a follow-up */}
      <Appear at={22}>
        <Screenshot src="shots/voice_question.png" width={760} ratio={Q_RATIO} />
      </Appear>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 22 }}>
        <Appear at={38}>
          <div style={{ fontSize: 27, lineHeight: 1.45, color: COLORS.inkSoft }}>
            The workbench <strong style={{ color: COLORS.ink, fontWeight: 600 }}>asks follow-up
            questions</strong> and you answer aloud — a richer note than anyone types by hand.
          </div>
        </Appear>

        <Appear at={54}>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.1em", color: COLORS.primary }}>
            → IT THEN READS THE SENTIMENT
          </div>
        </Appear>

        {/* the real extracted risk/sentiment strip */}
        <Appear at={62}>
          <Screenshot src="shots/voice_sentiment.png" width={620} ratio={S_RATIO} style={{ borderRadius: 12 }} />
        </Appear>

        <Appear at={76}>
          <div style={{ fontSize: 22, color: COLORS.inkFaint }}>
            Risk appetite, topics and values — extracted, cited, staged for your confirm.
          </div>
        </Appear>
      </div>
    </div>
  </Stage>
);

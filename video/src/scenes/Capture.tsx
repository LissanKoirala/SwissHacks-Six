import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { Appear, Headline, HL, Stage } from "../ui";
import { COLORS } from "../theme";
import { CAPTURE_CHAT as C } from "../content";

// --- timing: Q, A and keyword-pickup frames per turn ---
const TURN_AT = [
  { q: 16, a: 30, keys: 42 },
  { q: 58, a: 72, keys: 84 },
  { q: 100, a: 114, keys: 124 },
];
const SENTIMENT_FROM = 88;
const SENTIMENT_TO = 112;

// answer text with its keywords highlighted (background fades in at `hot`)
function HiAnswer({ text, keys, hot }: { text: string; keys: string[]; hot: number }) {
  if (!keys.length) return <>{text}</>;
  const re = new RegExp(`(${keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) => {
        const isKey = keys.some((k) => k.toLowerCase() === p.toLowerCase());
        if (!isKey) return <React.Fragment key={i}>{p}</React.Fragment>;
        return (
          <span
            key={i}
            style={{
              background: `rgba(232,242,255,${hot})`,
              color: hot > 0.4 ? COLORS.primary : COLORS.ink,
              borderRadius: 6,
              padding: "0 4px",
              fontWeight: 600,
            }}
          >
            {p}
          </span>
        );
      })}
    </>
  );
}

const MicGlyph: React.FC = () => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 2, height: 18 }}>
    {[8, 14, 18, 12, 16, 9].map((h, i) => (
      <span key={i} style={{ width: 2.5, height: h, borderRadius: 2, background: "#fff", opacity: 0.9 }} />
    ))}
  </span>
);

const Bubble: React.FC<{ side: "ask" | "answer"; at: number; keys?: string[]; hot: number; children: React.ReactNode }> = ({
  side,
  at,
  keys = [],
  hot,
  children,
}) => {
  const ask = side === "ask";
  return (
    <Appear at={at} y={14} style={{ display: "flex", justifyContent: ask ? "flex-start" : "flex-end" }}>
      <div
        style={{
          maxWidth: 660,
          borderRadius: 16,
          borderTopLeftRadius: ask ? 4 : 16,
          borderTopRightRadius: ask ? 16 : 4,
          padding: "14px 18px",
          background: ask ? "#f5f5f5" : COLORS.primary,
          color: ask ? COLORS.ink : "#fff",
          boxShadow: ask ? `inset 0 0 0 1.5px ${COLORS.border}` : "none",
          fontSize: 24,
          lineHeight: 1.4,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          {ask ? (
            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.08em", color: COLORS.inkSoft }}>WORKBENCH ASKS</span>
          ) : (
            <>
              <MicGlyph />
              <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.85)" }}>SPOKEN</span>
            </>
          )}
        </div>
        {ask ? children : <span><HiAnswer text={children as string} keys={keys} hot={hot} /></span>}
      </div>
    </Appear>
  );
};

export const CaptureScene: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();

  // all picked-up keywords with the frame they appear
  const chips: { label: string; at: number }[] = [];
  C.turns.forEach((t, i) => t.keys.forEach((k) => chips.push({ label: k, at: TURN_AT[i].keys })));

  const sentiment = interpolate(frame, [SENTIMENT_FROM, SENTIMENT_TO], [0.5, 0.34], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sentLive = frame >= SENTIMENT_FROM;

  return (
    <Stage dur={dur} kicker="Capture · voice note-taking">
      <Appear at={8}>
        <Headline size={54}>
          After the meeting, just <HL>talk</HL> — it asks, listens, and reads the room.
        </Headline>
      </Appear>

      <div style={{ marginTop: 28, display: "flex", gap: 56, flex: 1 }}>
        {/* the back-and-forth */}
        <div style={{ flex: 1.4, display: "flex", flexDirection: "column", gap: 14 }}>
          {C.turns.map((t, i) => (
            <React.Fragment key={i}>
              <Bubble side="ask" at={TURN_AT[i].q} hot={0}>
                {t.q}
              </Bubble>
              <Bubble
                side="answer"
                at={TURN_AT[i].a}
                keys={t.keys}
                hot={interpolate(frame, [TURN_AT[i].keys, TURN_AT[i].keys + 14], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                })}
              >
                {t.a}
              </Bubble>
            </React.Fragment>
          ))}
        </div>

        {/* live extraction: keywords picked up + sentiment */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <Appear at={26}>
            <div
              style={{
                borderRadius: 18,
                background: "#fff",
                boxShadow: `inset 0 0 0 1.5px ${COLORS.border}, 0 18px 40px -28px rgba(16,24,40,0.25)`,
                padding: 28,
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.1em", color: COLORS.inkSoft }}>
                PICKED UP
              </div>
              <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 10, minHeight: 132 }}>
                {chips.map((c) => {
                  const o = interpolate(frame, [c.at, c.at + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
                  const ty = interpolate(frame, [c.at, c.at + 12], [10, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
                  return (
                    <span
                      key={c.label}
                      style={{
                        opacity: o,
                        transform: `translateY(${ty}px)`,
                        padding: "10px 16px",
                        borderRadius: 999,
                        background: COLORS.primarySubtle,
                        color: COLORS.primary,
                        boxShadow: "inset 0 0 0 1.5px #cfe2ff",
                        fontSize: 22,
                        fontWeight: 600,
                      }}
                    >
                      {c.label}
                    </span>
                  );
                })}
              </div>

              {/* sentiment / risk-appetite gauge */}
              <div style={{ marginTop: 26, opacity: sentLive ? 1 : 0.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, color: COLORS.inkSoft }}>
                  <span>Risk appetite</span>
                  <span style={{ color: sentLive ? COLORS.primary : COLORS.inkFaint, fontWeight: 600 }}>
                    {sentLive ? "de-risk ↓" : "listening…"}
                  </span>
                </div>
                <div style={{ position: "relative", height: 10, borderRadius: 999, background: "#f0f0f0", marginTop: 12 }}>
                  <div style={{ position: "absolute", left: "50%", top: -6, width: 2, height: 22, background: COLORS.inkFaint }} />
                  <div
                    style={{
                      position: "absolute",
                      top: -5,
                      left: `${sentiment * 100}%`,
                      width: 20,
                      height: 20,
                      borderRadius: 999,
                      background: COLORS.primary,
                      transform: "translateX(-50%)",
                      boxShadow: "0 4px 14px -4px rgba(0,96,223,0.6)",
                    }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, color: COLORS.inkFaint, marginTop: 8 }}>
                  <span>cautious</span>
                  <span>opportunistic</span>
                </div>
              </div>
            </div>
          </Appear>

          <Appear at={132} style={{ marginTop: 18 }}>
            <div style={{ fontSize: 22, fontWeight: 600, color: COLORS.primary }}>
              → ready to update the profile
            </div>
          </Appear>
        </div>
      </div>
    </Stage>
  );
};

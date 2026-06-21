import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { Appear, Headline, HL, Stage } from "../ui";
import { COLORS, MONO } from "../theme";
import { CRM_UPDATE as U } from "../content";

// shared-coordinate container so the SVG connectors line up with the HTML panels
const CW = 1640;
const CH = 600;
const NOTE_W = 1040;
const NOTE_X = (CW - NOTE_W) / 2;
const NOTE_H = 116;
const NOTE_BOTTOM = NOTE_H;

const PANEL_W = 380;
const GAP = (CW - PANEL_W * 4) / 3;
const PANEL_TOP = 250;
const PANEL_H = 330;
const panelLeft = (i: number) => i * (PANEL_W + GAP);
const panelCx = (i: number) => panelLeft(i) + PANEL_W / 2;

// each facet update lands in sequence
const LAND0 = 46;
const STAGGER = 22;
const landAt = (i: number) => LAND0 + i * STAGGER;

const Waveform: React.FC = () => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, height: 24 }}>
    {[10, 18, 8, 22, 14, 24, 12, 18, 9, 16].map((h, i) => (
      <span key={i} style={{ width: 3, height: h, borderRadius: 2, background: COLORS.primary, opacity: 0.85 }} />
    ))}
  </span>
);

const FacetPanel: React.FC<{ i: number }> = ({ i }) => {
  const frame = useCurrentFrame();
  const f = U.facets[i];
  const land = landAt(i);
  const appear = interpolate(frame, [land, land + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const slide = interpolate(frame, [land, land + 14], [12, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // highlight fades from blue → white as the row settles
  const hot = interpolate(frame, [land, land + 26], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bg = `rgba(232,242,255,${0.9 * hot})`;
  const lit = frame >= land - 2;

  return (
    <div
      style={{
        position: "absolute",
        left: panelLeft(i),
        top: PANEL_TOP,
        width: PANEL_W,
        height: PANEL_H,
        borderRadius: 16,
        background: "#fff",
        boxShadow: lit
          ? `inset 0 0 0 2px ${COLORS.primary}, 0 18px 40px -28px rgba(0,96,223,0.4)`
          : `inset 0 0 0 1.5px ${COLORS.border}`,
        padding: 24,
        opacity: lit ? 1 : 0.6,
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.08em", color: lit ? COLORS.primary : COLORS.inkFaint }}>
        {f.key.toUpperCase()}
      </div>

      {/* the established facet line (context) */}
      <div style={{ marginTop: 16, fontSize: 21, lineHeight: 1.35, color: COLORS.inkFaint }}>{f.existing}</div>

      {/* the new, animated entry */}
      <div
        style={{
          marginTop: 14,
          opacity: appear,
          transform: `translateY(${slide}px)`,
          borderRadius: 12,
          background: bg,
          padding: "12px 14px",
          boxShadow: `inset 0 0 0 1.5px rgba(0,96,223,${0.25 * (0.3 + hot)})`,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "0.1em", color: COLORS.primary }}>+ NEW</span>
        <div style={{ marginTop: 6, fontSize: 22, lineHeight: 1.35, color: COLORS.ink, fontWeight: 500 }}>{f.added}</div>
      </div>

      {/* personality also nudges the risk meter */}
      {f.risk ? (
        <div style={{ marginTop: 16, opacity: appear }}>
          <div style={{ fontSize: 16, color: COLORS.inkSoft, marginBottom: 6 }}>Risk appetite</div>
          <div style={{ position: "relative", height: 8, borderRadius: 999, background: "#f0f0f0" }}>
            {(() => {
              const x = interpolate(frame, [land + 8, land + 30], [0.55, 0.42], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              return <div style={{ position: "absolute", left: `${x * 100}%`, top: -5, width: 18, height: 18, borderRadius: 999, background: COLORS.primary, transform: "translateX(-50%)" }} />;
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export const CrmUpdateScene: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();

  return (
    <Stage dur={dur} kicker="The note becomes the profile">
      <Appear at={8}>
        <Headline size={56}>
          One conversation, and the <HL>living profile</HL> updates itself.
        </Headline>
      </Appear>

      <div style={{ position: "relative", width: CW, height: CH, margin: "34px auto 0" }}>
        {/* the voice note carried over from the previous slide */}
        <Appear at={16}>
          <div
            style={{
              position: "absolute",
              left: NOTE_X,
              top: 0,
              width: NOTE_W,
              height: NOTE_H,
              borderRadius: 16,
              background: COLORS.primarySubtle,
              boxShadow: `inset 0 0 0 1.5px #cfe2ff`,
              padding: "16px 24px",
              display: "flex",
              alignItems: "center",
              gap: 18,
            }}
          >
            <Waveform />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "0.08em", color: COLORS.primary }}>
                {U.source.label.toUpperCase()} · {U.source.title}
              </div>
              <div style={{ marginTop: 4, fontSize: 19, lineHeight: 1.3, color: COLORS.ink }}>{U.source.snippet}</div>
            </div>
          </div>
        </Appear>

        {/* connectors fanning from the note into each facet as it lands */}
        <svg width={CW} height={CH} style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}>
          {U.facets.map((_, i) => {
            const reveal = interpolate(frame, [landAt(i) - 14, landAt(i)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const x0 = CW / 2;
            const y0 = NOTE_BOTTOM;
            const x1 = panelCx(i);
            const y1 = PANEL_TOP - 6;
            const my = (y0 + y1) / 2;
            const d = `M ${x0} ${y0} C ${x0} ${my}, ${x1} ${my}, ${x1} ${y1}`;
            return (
              <path
                key={i}
                d={d}
                fill="none"
                stroke={COLORS.primary}
                strokeWidth={3}
                opacity={0.5}
                strokeDasharray={1000}
                strokeDashoffset={1000 * (1 - reveal)}
              />
            );
          })}
        </svg>

        {/* the four facet panels */}
        {U.facets.map((_, i) => (
          <FacetPanel key={i} i={i} />
        ))}

        {/* closing line */}
        <div
          style={{
            position: "absolute",
            top: PANEL_TOP + PANEL_H + 28,
            left: 0,
            width: CW,
            textAlign: "center",
            opacity: interpolate(frame, [landAt(3) + 18, landAt(3) + 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            fontSize: 26,
            fontWeight: 600,
            color: COLORS.primary,
          }}
        >
          {U.close}
        </div>
      </div>
    </Stage>
  );
};

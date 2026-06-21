import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { Appear, Headline, HL, Stage } from "../ui";
import { COLORS, MONO } from "../theme";
import { TRUST } from "../content";

// shared-coordinate container: HTML columns + an SVG overlay for the chain.
const CW = 1640;
const CH = 600;
const COLW = 360;
const STEP = (CW - COLW) / 3;
const colLeft = (i: number) => i * STEP;

const HEADER_H = 40;
const Y0 = HEADER_H + 10;
const RH = 58;
const PITCH = RH + 8;
const rowY = (idx: number) => Y0 + idx * PITCH + RH / 2;

const COLS = [TRUST.log, TRUST.topics, TRUST.news, TRUST.cio];
// when each column's cited row lights up
const ACTIVATE = [40, 64, 88, 112];

type RowData = { primary: string; secondary?: string };

const Row: React.FC<{ row: RowData; lit: boolean; mono: boolean }> = ({ row, lit, mono }) => (
  <div
    style={{
      position: "relative",
      height: RH,
      marginBottom: PITCH - RH,
      borderRadius: 10,
      background: lit ? "#fff" : "transparent",
      boxShadow: lit ? `inset 0 0 0 2px ${COLORS.primary}` : `inset 0 0 0 1.5px ${COLORS.border}`,
      opacity: lit ? 1 : 0.4,
      padding: "8px 14px",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      overflow: "hidden",
    }}
  >
    {lit ? (
      <span style={{ position: "absolute", left: 0, top: 8, bottom: 8, width: 4, borderRadius: 2, background: COLORS.primary }} />
    ) : null}
    {row.secondary && mono ? (
      // git-style: hash + date on top, message below
      <>
        <span style={{ fontFamily: MONO, fontSize: 15, color: lit ? COLORS.primary : COLORS.inkFaint }}>
          {row.primary}
        </span>
        <span style={{ fontSize: 16, lineHeight: 1.2, color: lit ? COLORS.ink : COLORS.inkSoft, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
          {row.secondary}
        </span>
      </>
    ) : row.secondary ? (
      // name + rating chip (CIO)
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, fontSize: 18, fontWeight: lit ? 600 : 400, color: lit ? COLORS.ink : COLORS.inkSoft, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
          {row.primary}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: lit ? COLORS.primary : COLORS.inkFaint }}>{row.secondary}</span>
      </div>
    ) : (
      <span style={{ fontSize: 18, fontWeight: lit ? 600 : 400, lineHeight: 1.2, color: lit ? COLORS.ink : COLORS.inkSoft }}>
        {row.primary}
      </span>
    )}
  </div>
);

const Column: React.FC<{ i: number }> = ({ i }) => {
  const frame = useCurrentFrame();
  const col = COLS[i];
  const lit = frame >= ACTIVATE[i];
  const mono = i === 0;
  return (
    <div style={{ position: "absolute", left: colLeft(i), top: 0, width: COLW }}>
      <div style={{ height: HEADER_H, fontSize: 18, fontWeight: 700, letterSpacing: "0.1em", color: COLORS.inkSoft }}>
        {col.title}
      </div>
      <div style={{ marginTop: 10 }}>
        {col.rows.map((r, idx) => (
          <Row key={idx} row={r} lit={lit && idx === col.hl} mono={mono} />
        ))}
      </div>
    </div>
  );
};

export const TrustScene: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();

  // connectors from each cited row to the next, drawn just before the next lights
  const seg = (i: number) => {
    const x0 = colLeft(i) + COLW;
    const y0 = rowY(COLS[i].hl);
    const x1 = colLeft(i + 1);
    const y1 = rowY(COLS[i + 1].hl);
    const reveal = interpolate(frame, [ACTIVATE[i + 1] - 16, ACTIVATE[i + 1]], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const mx = (x0 + x1) / 2;
    return { d: `M ${x0} ${y0} C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}`, reveal, x1, y1 };
  };

  return (
    <Stage dur={dur} kicker="Trust & explainability · 25% of the score">
      <Appear at={8}>
        <Headline size={52}>
          Out of everything, we point at the <HL>one source</HL> — and nothing else.
        </Headline>
      </Appear>

      <div style={{ position: "relative", width: CW, height: CH, margin: "26px auto 0" }}>
        <svg width={CW} height={CH} style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}>
          {[0, 1, 2].map((i) => {
            const s = seg(i);
            return (
              <g key={i}>
                <path
                  d={s.d}
                  fill="none"
                  stroke={COLORS.primary}
                  strokeWidth={3.5}
                  strokeDasharray={1200}
                  strokeDashoffset={1200 * (1 - s.reveal)}
                />
                {s.reveal > 0.6 ? <circle cx={s.x1} cy={s.y1} r={5} fill={COLORS.primary} /> : null}
              </g>
            );
          })}
        </svg>

        {COLS.map((_, i) => (
          <Column key={i} i={i} />
        ))}
      </div>

      <Appear at={124} style={{ marginTop: 4 }}>
        <div style={{ fontSize: 26, color: COLORS.inkSoft }}>
          One log line → one topic → one news item → one CIO name. Every hop is{" "}
          <strong style={{ color: COLORS.ink, fontWeight: 600 }}>one click from its source</strong>.
        </div>
      </Appear>
    </Stage>
  );
};

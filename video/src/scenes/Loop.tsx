import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { Appear, Headline, HL, Stage } from "../ui";
import { COLORS, MONO } from "../theme";
import { LOOP } from "../content";

// layout (within a fixed container so the SVG token + HTML cards share coords)
const CW = 1640;
const CH = 470;
const CARDW = 360;
const CARDH = 252;
const CARDY = 36;
const STEP = (CW - CARDW) / 3; // left of each card
const cardLeft = (i: number) => i * STEP;
const cardCx = (i: number) => cardLeft(i) + CARDW / 2;
const CY = CARDY + CARDH / 2; // vertical centre of the row (token track)
const CARD_BOTTOM = CARDY + CARDH;

// token sweep timing
const TOK_START = 34;
const TOK_END = 132;
const tokenX = (f: number) => interpolate(f, [TOK_START, TOK_END], [cardCx(0), cardCx(3)], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
// a stage is "lit" once the token reaches its centre
const litAt = (i: number) => interpolate(cardCx(i), [cardCx(0), cardCx(3)], [TOK_START, TOK_END]);

const StageCard: React.FC<{ i: number }> = ({ i }) => {
  const frame = useCurrentFrame();
  const s = LOOP.stages[i];
  const on = frame >= litAt(i) - 2;
  const fill = interpolate(frame, [litAt(i), litAt(i) + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: cardLeft(i),
        top: CARDY,
        width: CARDW,
        height: CARDH,
        borderRadius: 18,
        background: on ? "#fff" : "#fafafa",
        boxShadow: on
          ? `inset 0 0 0 2px ${COLORS.primary}, 0 20px 44px -26px rgba(0,96,223,0.45)`
          : `inset 0 0 0 1.5px ${COLORS.border}`,
        padding: 26,
        transition: "none",
        opacity: on ? 1 : 0.55,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          style={{
            width: 46,
            height: 46,
            borderRadius: 12,
            display: "grid",
            placeItems: "center",
            background: on ? COLORS.primary : "#f0f0f0",
            color: on ? "#fff" : COLORS.inkFaint,
            fontSize: 24,
            fontWeight: 700,
          }}
        >
          {i + 1}
        </span>
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.1em", color: on ? COLORS.primary : COLORS.inkFaint }}>
          {s.label.toUpperCase()}
        </span>
      </div>
      <div style={{ marginTop: 16, fontSize: 30, fontWeight: 600, color: COLORS.ink }}>{s.title}</div>
      <div style={{ marginTop: 10, opacity: fill, transform: `translateY(${(1 - fill) * 8}px)` }}>
        {s.lines.map((ln) => (
          <div key={ln} style={{ fontSize: 22, lineHeight: 1.4, color: COLORS.inkSoft }}>
            {ln}
          </div>
        ))}
        {s.meta ? (
          <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 19, color: COLORS.inkFaint }}>{s.meta}</div>
        ) : null}
      </div>
    </div>
  );
};

export const LoopScene: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const tx = tokenX(frame);

  // connectors between cards fill as the token passes the gap
  const connFill = (i: number) => {
    const x0 = cardLeft(i) + CARDW;
    const x1 = cardLeft(i + 1);
    return interpolate(tx, [x0, x1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  };

  // return arc draws after the sweep, looping CRM (card3) back to Plan (card0)
  const arc = interpolate(frame, [TOK_END + 4, TOK_END + 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ax0 = cardCx(3);
  const ax1 = cardCx(0);
  const arcTopY = CARD_BOTTOM + 4;
  const arcDipY = CH - 6;
  const arcPath = `M ${ax0} ${arcTopY} C ${ax0} ${arcDipY}, ${ax1} ${arcDipY}, ${ax1} ${arcTopY}`;
  const tokenVisible = frame >= TOK_START && frame <= TOK_END + 2;

  return (
    <Stage dur={dur} kicker="The relationship loop">
      <Appear at={8}>
        <Headline size={58}>
          Plan, meet, log — and the <HL>profile gets smarter</HL> each time.
        </Headline>
      </Appear>

      <div style={{ position: "relative", width: CW, height: CH, margin: "44px auto 0" }}>
        {/* SVG layer: connectors, token, return arc */}
        <svg width={CW} height={CH} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          {[0, 1, 2].map((i) => {
            const x0 = cardLeft(i) + CARDW;
            const x1 = cardLeft(i + 1);
            return (
              <g key={i}>
                <line x1={x0} y1={CY} x2={x1} y2={CY} stroke={COLORS.border} strokeWidth={4} />
                <line x1={x0} y1={CY} x2={x0 + (x1 - x0) * connFill(i)} y2={CY} stroke={COLORS.primary} strokeWidth={4} />
              </g>
            );
          })}

          {/* return arc */}
          <path
            d={arcPath}
            fill="none"
            stroke={COLORS.primary}
            strokeWidth={4}
            strokeDasharray={1400}
            strokeDashoffset={1400 * (1 - arc)}
            opacity={0.85}
          />
          {arc > 0.6 ? (
            <polygon
              points={`${ax1 - 9},${arcTopY + 14} ${ax1 + 9},${arcTopY + 14} ${ax1},${arcTopY}`}
              fill={COLORS.primary}
            />
          ) : null}

          {/* the travelling token */}
          {tokenVisible ? (
            <>
              <circle cx={tx} cy={CY} r={20} fill={COLORS.primary} opacity={0.18} />
              <circle cx={tx} cy={CY} r={11} fill={COLORS.primary} />
            </>
          ) : null}
        </svg>

        {/* the four stage cards */}
        {LOOP.stages.map((_, i) => (
          <StageCard key={i} i={i} />
        ))}

        {/* arc caption */}
        <div
          style={{
            position: "absolute",
            top: arcDipY - 6,
            left: 0,
            width: CW,
            textAlign: "center",
            opacity: arc,
            fontSize: 24,
            fontWeight: 600,
            color: COLORS.primary,
          }}
        >
          {LOOP.close}
        </div>
      </div>
    </Stage>
  );
};

import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { Appear, Headline, HL, MetaChip, Stage } from "../ui";
import { COLORS, MONO } from "../theme";
import { SCHNEIDER } from "../content";

const R = SCHNEIDER.risk;

// chart geometry (within the SVG)
const W = 1580;
const H = 470;
const L = 96; // left margin (y labels)
const RM = 40; // right margin
const T = 76; // top margin (event callouts)
const B = 56; // bottom margin (x labels)
const PW = W - L - RM;
const PH = H - T - B;

const N = R.scores.length;
const xAt = (i: number) => L + (i / (N - 1)) * PW;
const yAt = (v: number) => T + (1 - v) * PH;

const Y_TICKS = [
  { v: 1, label: "1.0", note: "risk-on" },
  { v: 0.5, label: "0.5", note: "" },
  { v: 0, label: "0.0", note: "defensive" },
];

export const RiskScene: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const chrome = interpolate(frame, [12, 28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const draw = interpolate(frame, [28, 100], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const path = R.scores.map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`).join(" ");
  const last = R.scores.length - 1;

  return (
    <Stage dur={dur} kicker="Risk timeline">
      <Appear at={8}>
        <Headline size={58}>
          Specific <HL>events move the line</HL> — and the desk can show which.
        </Headline>
      </Appear>

      <div style={{ marginTop: 18 }}>
        <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
          {/* mandate band */}
          <rect
            x={L}
            y={yAt(R.band[1])}
            width={PW}
            height={yAt(R.band[0]) - yAt(R.band[1])}
            fill={COLORS.primarySubtle}
            opacity={chrome}
          />

          {/* y axis + ticks */}
          <line x1={L} x2={L} y1={T} y2={T + PH} stroke={COLORS.border} strokeWidth={2} opacity={chrome} />
          {Y_TICKS.map((t) => (
            <g key={t.label} opacity={chrome}>
              <line x1={L - 8} x2={L} y1={yAt(t.v)} y2={yAt(t.v)} stroke={COLORS.border} strokeWidth={2} />
              <text x={L - 18} y={yAt(t.v) + 8} textAnchor="end" fontSize={24} fill={COLORS.inkSoft}>
                {t.label}
              </text>
              {t.note ? (
                <text x={L - 18} y={yAt(t.v) + 34} textAnchor="end" fontSize={18} fill={COLORS.inkFaint}>
                  {t.note}
                </text>
              ) : null}
            </g>
          ))}

          {/* baseline */}
          <line
            x1={L}
            x2={L + PW}
            y1={yAt(R.baseline)}
            y2={yAt(R.baseline)}
            stroke={COLORS.inkFaint}
            strokeWidth={2}
            strokeDasharray="8 8"
            opacity={chrome}
          />
          <text x={L + PW} y={yAt(R.baseline) - 12} textAnchor="end" fontSize={20} fill={COLORS.inkFaint} opacity={chrome}>
            mandate baseline {R.baseline}
          </text>

          {/* x axis + ticks */}
          <line x1={L} x2={L + PW} y1={T + PH} y2={T + PH} stroke={COLORS.border} strokeWidth={2} opacity={chrome} />
          {R.ticks.map((t) => (
            <g key={t.i} opacity={chrome}>
              <line x1={xAt(t.i)} x2={xAt(t.i)} y1={T + PH} y2={T + PH + 8} stroke={COLORS.border} strokeWidth={2} />
              <text x={xAt(t.i)} y={T + PH + 36} textAnchor="middle" fontSize={22} fill={COLORS.inkSoft}>
                {t.label}
              </text>
            </g>
          ))}

          {/* the risk line, drawn in */}
          <path
            d={path}
            fill="none"
            stroke={COLORS.primary}
            strokeWidth={6}
            strokeLinejoin="round"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={100}
            strokeDashoffset={100 * (1 - draw)}
          />
          <circle cx={xAt(last)} cy={yAt(R.scores[last])} r={13} fill={COLORS.primary} opacity={draw > 0.98 ? 1 : 0} />

          {/* event markers — the triggers */}
          {R.events.map((e, k) => {
            const ex = xAt(e.i);
            const ey = yAt(R.scores[e.i]);
            const calloutY = T - 18;
            const appear = interpolate(frame, [104 + k * 12, 120 + k * 12], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            // keep the label box from spilling off the right edge
            const boxX = Math.min(ex - 12, W - RM - 290);
            return (
              <g key={e.i} opacity={appear}>
                <line x1={ex} x2={ex} y1={calloutY + 6} y2={ey - 14} stroke={COLORS.warning} strokeWidth={2} strokeDasharray="5 5" />
                <circle cx={ex} cy={ey} r={11} fill="#fff" stroke={COLORS.warning} strokeWidth={4} />
                <text x={boxX} y={calloutY - 22} fontSize={23} fontWeight={700} fill={COLORS.ink}>
                  {e.label}
                </text>
                <text x={boxX} y={calloutY + 4} fontSize={20} fill={COLORS.inkSoft}>
                  {e.date} · {e.cue}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <Appear at={132} style={{ marginTop: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <MetaChip>Mandate · Balanced</MetaChip>
          <MetaChip>
            <span style={{ fontFamily: MONO }}>0.62 → 0.19</span> · de-risking
          </MetaChip>
          <span style={{ padding: "8px 16px", borderRadius: 999, background: "#fdf0db", color: "#b5680a", fontSize: 22, fontWeight: 600 }}>
            cautious-drift
          </span>
          <span style={{ fontSize: 25, color: COLORS.inkSoft }}>
            — each shift traces to a logged note, after his daughter&rsquo;s diagnosis.
          </span>
        </div>
      </Appear>
    </Stage>
  );
};

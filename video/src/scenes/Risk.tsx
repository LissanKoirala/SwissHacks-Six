import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { Appear, Headline, HL, MetaChip, Stage } from "../ui";
import { COLORS } from "../theme";
import { SCHNEIDER } from "../content";

const R = SCHNEIDER.risk;
const W = 1560;
const H = 360;

const x = (i: number, n: number) => (i / (n - 1)) * W;
const y = (v: number) => H - v * H;

export const RiskScene: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const n = R.scores.length;
  const draw = interpolate(frame, [24, 96], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const chrome = interpolate(frame, [14, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const path = R.scores.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i, n).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const last = { cx: x(n - 1, n), cy: y(R.scores[n - 1]) };

  return (
    <Stage dur={dur} kicker="Risk timeline">
      <Appear at={8}>
        <Headline size={60}>
          Risk appetite, <HL>replayed from three years of notes</HL>.
        </Headline>
      </Appear>

      <div style={{ marginTop: 28, position: "relative" }}>
        <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
          {/* mandate band */}
          <rect
            x={0}
            y={y(R.band[1])}
            width={W}
            height={y(R.band[0]) - y(R.band[1])}
            fill={COLORS.primarySubtle}
            opacity={chrome}
          />
          {/* baseline */}
          <line
            x1={0}
            x2={W}
            y1={y(R.baseline)}
            y2={y(R.baseline)}
            stroke={COLORS.inkFaint}
            strokeWidth={2}
            strokeDasharray="8 8"
            opacity={chrome}
          />
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
          {/* current marker */}
          <circle cx={last.cx} cy={last.cy} r={14} fill={COLORS.primary} opacity={draw > 0.98 ? 1 : 0} />
        </svg>

        {/* axis labels */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, opacity: chrome }}>
          <span style={{ fontSize: 22, color: COLORS.inkSoft }}>{R.from}</span>
          <span style={{ fontSize: 22, color: COLORS.inkSoft }}>{R.to}</span>
        </div>
      </div>

      <Appear at={104} style={{ marginTop: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <MetaChip>Mandate · Balanced (baseline {R.baseline})</MetaChip>
          <MetaChip>0.62 → 0.19 · de-risking</MetaChip>
          <span
            style={{
              padding: "8px 16px",
              borderRadius: 999,
              background: "#fdf0db",
              color: "#b5680a",
              fontSize: 22,
              fontWeight: 600,
            }}
          >
            cautious-drift
          </span>
          <span style={{ fontSize: 26, color: COLORS.inkSoft }}>
            — he turned defensive after his daughter&rsquo;s diagnosis. The desk knew, and could show why.
          </span>
        </div>
      </Appear>
    </Stage>
  );
};

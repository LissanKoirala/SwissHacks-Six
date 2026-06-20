import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Appear, HL } from "../ui";
import { COLORS } from "../theme";
import { FONT } from "../fonts";
import { enterExit } from "../ui";

export const OutroScene: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const opacity = enterExit(frame, dur);
  const rule = interpolate(frame, [20, 44], [0, 560], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        fontFamily: FONT,
        color: COLORS.ink,
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <div style={{ opacity }}>
        <Appear at={6}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 22 }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: COLORS.primary }} />
            <span style={{ fontSize: 92, fontWeight: 300, letterSpacing: "-0.02em" }}>
              Advisory Workbench
            </span>
          </div>
        </Appear>

        <div style={{ height: 3, background: COLORS.primary, width: rule, margin: "40px auto" }} />

        <Appear at={28}>
          <div style={{ fontSize: 42, fontWeight: 400, color: COLORS.ink }}>
            The agent proposes. <HL>The RM approves. The client decides.</HL>
          </div>
        </Appear>

        <Appear at={48}>
          <div style={{ marginTop: 40, fontSize: 26, color: COLORS.inkSoft, letterSpacing: "0.04em" }}>
            SwissHacks · The Next Generation of Wealth Advisory
          </div>
        </Appear>
      </div>
    </AbsoluteFill>
  );
};

import React from "react";
import { Appear, Headline, HL, Stage } from "../../ui";
import { COLORS } from "../../theme";
import { WORKFLOW } from "../../content";

const AL = WORKFLOW.alert;

// A simple phone with a lock-screen notification at 09:00.
const Phone: React.FC = () => (
  <div
    style={{
      width: 420,
      height: 760,
      borderRadius: 56,
      background: "#0b0b0d",
      boxShadow: "0 40px 80px -40px rgba(16,24,40,0.55)",
      padding: 16,
    }}
  >
    <div style={{ width: "100%", height: "100%", borderRadius: 44, background: "#15233b", position: "relative", overflow: "hidden" }}>
      {/* notch */}
      <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", width: 140, height: 26, borderRadius: 999, background: "#0b0b0d" }} />
      {/* clock */}
      <div style={{ textAlign: "center", color: "#fff", marginTop: 84 }}>
        <div style={{ fontSize: 96, fontWeight: 300, letterSpacing: "-0.02em" }}>{AL.time}</div>
        <div style={{ fontSize: 22, color: "rgba(255,255,255,0.7)" }}>Saturday, 20 June</div>
      </div>
      {/* notification */}
      <div style={{ position: "absolute", left: 18, right: 18, top: 300 }}>
        <div style={{ background: "rgba(255,255,255,0.94)", borderRadius: 22, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 26, height: 26, borderRadius: 7, background: COLORS.primary }} />
            <span style={{ fontSize: 19, fontWeight: 700, color: COLORS.ink }}>{AL.sender}</span>
            <span style={{ marginLeft: "auto", fontSize: 16, color: COLORS.inkSoft }}>now</span>
          </div>
          <div style={{ marginTop: 10, fontSize: 21, lineHeight: 1.4, color: COLORS.ink }}>{AL.text}</div>
        </div>
      </div>
    </div>
  </div>
);

export const WfAlert: React.FC<{ dur: number }> = ({ dur }) => (
  <Stage dur={dur} kicker="At 9am — the RM gets one nudge">
    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 80 }}>
      <div style={{ flex: 1 }}>
        <Appear at={10}>
          <Headline size={66}>
            One client. One alert. <HL>No noise.</HL>
          </Headline>
        </Appear>
        <Appear at={30} style={{ marginTop: 28 }}>
          <p style={{ fontSize: 30, lineHeight: 1.5, color: COLORS.inkSoft, maxWidth: 720 }}>
            The work is already done and parked for review. The RM wakes to a single, specific
            prompt — not an inbox to triage.
          </p>
        </Appear>
      </div>
      <Appear at={18}>
        <Phone />
      </Appear>
    </div>
  </Stage>
);

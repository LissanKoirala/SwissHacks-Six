import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { Appear, Headline, Stage } from "../../ui";
import { COLORS } from "../../theme";
import { WORKFLOW } from "../../content";

const TK = WORKFLOW.task;

// board geometry
const COLW = 512;
const COLX = [0, 552, 1104];
const BODY_Y = 64;
const BODY_H = 430;

const PRI = {
  High: { bg: "#fde8e9", fg: COLORS.destructive },
  Medium: { bg: "#fdf0db", fg: "#b5680a" },
  Low: { bg: "#f5f5f5", fg: COLORS.inkSoft },
} as const;

const MiniCard: React.FC<{ title: string; client?: string; pri?: keyof typeof PRI }> = ({ title, client, pri = "Low" }) => {
  const p = PRI[pri];
  return (
    <div style={{ background: "#fff", borderRadius: 12, boxShadow: `inset 0 0 0 1.5px ${COLORS.border}`, padding: 16, marginBottom: 12 }}>
      <span style={{ display: "inline-block", padding: "4px 12px", borderRadius: 999, fontSize: 16, fontWeight: 700, background: p.bg, color: p.fg }}>
        {pri}
      </span>
      <div style={{ marginTop: 8, fontSize: 20, color: COLORS.ink, lineHeight: 1.3 }}>{title}</div>
      {client ? <div style={{ marginTop: 4, fontSize: 17, color: COLORS.inkSoft }}>{client}</div> : null}
    </div>
  );
};

const Column: React.FC<{ x: number; label: string; count: number; children?: React.ReactNode }> = ({ x, label, count, children }) => (
  <div style={{ position: "absolute", left: x, top: 0, width: COLW }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0.06em", color: COLORS.ink }}>{label}</span>
      <span style={{ display: "grid", placeItems: "center", minWidth: 26, height: 26, borderRadius: 999, background: "#f0f0f0", fontSize: 16, fontWeight: 700, color: COLORS.inkSoft }}>
        {count}
      </span>
    </div>
    <div style={{ position: "absolute", top: BODY_Y, left: 0, width: COLW, height: BODY_H, background: "#fafafa", borderRadius: 14, boxShadow: `inset 0 0 0 1.5px ${COLORS.border}`, padding: 16 }}>
      {children}
    </div>
  </div>
);

export const WfBoard: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();

  // hero card glides To do → In progress → Needs sign-off
  const left = interpolate(frame, [46, 78, 120, 150], [COLX[0] + 16, COLX[1] + 16, COLX[1] + 16, COLX[2] + 16], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const moving = (frame > 46 && frame < 80) || (frame > 118 && frame < 152);
  const grab = moving ? 1.04 : 1;
  const phase = frame < 80 ? 0 : frame < 150 ? 1 : 2;
  const spin = frame * 9;

  return (
    <Stage dur={dur} kicker="The agentic task board" showWordmark={false}>
      <Appear at={8}>
        <Headline size={56}>It lands on the board — the agent works it, you sign it off.</Headline>
      </Appear>

      <div style={{ position: "relative", height: BODY_Y + BODY_H, marginTop: 30 }}>
        <Column x={COLX[0]} label="To do" count={2}>
          <MiniCard title="Schedule quarterly review — book Q3 call" client="Schneider" pri="Low" />
        </Column>
        <Column x={COLX[1]} label="In progress" count={1}>
          <MiniCard title="Research: tech & discretionary exposure vs peers" client="Ammann" pri="Medium" />
        </Column>
        <Column x={COLX[2]} label="Needs sign-off" count={3}>
          {/* reserve the top slot — the hero card lands here */}
          <div style={{ height: 192 }} />
          <MiniCard title="Opportunity: Unilever aligned on deforestation" client="Huber" pri="Medium" />
          <MiniCard title="Draft reply: referral enquiry" pri="Medium" />
        </Column>

        {/* the hero card, gliding across the board */}
        <Appear at={30}>
          <div
            style={{
              position: "absolute",
              top: BODY_Y + 16,
              left,
              width: COLW - 32,
              transform: `scale(${grab})`,
              background: "#fff",
              borderRadius: 12,
              boxShadow: moving
                ? `inset 0 0 0 2px ${COLORS.primary}, 0 22px 40px -18px rgba(16,24,40,0.45)`
                : `inset 0 0 0 1.5px ${COLORS.border}, 0 10px 24px -18px rgba(16,24,40,0.35)`,
              padding: 18,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ padding: "4px 12px", borderRadius: 999, fontSize: 16, fontWeight: 700, background: PRI.High.bg, color: PRI.High.fg }}>
                High
              </span>
              <span style={{ fontSize: 15, color: COLORS.inkFaint }}>news · investment_review</span>
            </div>
            <div style={{ marginTop: 10, fontSize: 22, fontWeight: 600, color: COLORS.ink, lineHeight: 1.3 }}>
              {TK.title}
            </div>
            <div style={{ marginTop: 6, fontSize: 18, color: COLORS.inkSoft }}>Mr. {TK.client}</div>

            {/* status footer changes with the phase */}
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
              {phase === 1 && (
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 999,
                    border: `3px solid ${COLORS.primarySubtle}`,
                    borderTopColor: COLORS.primary,
                    display: "inline-block",
                    transform: `rotate(${spin}deg)`,
                  }}
                />
              )}
              {phase === 2 && (
                <span style={{ color: COLORS.success, fontSize: 22, fontWeight: 800 }}>✓</span>
              )}
              <span style={{ fontSize: 18, fontWeight: 600, color: phase === 2 ? COLORS.success : COLORS.inkSoft }}>
                {phase === 0 ? "queued" : phase === 1 ? "agent working…" : "drafted — awaiting your review"}
              </span>
            </div>
          </div>
        </Appear>
      </div>

      {/* agent log — the real activity trail, streaming during 'in progress' */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.1em", color: COLORS.inkSoft }}>AGENT LOG</div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
          {TK.activity.map((a, i) => (
            <Appear key={a} at={86 + i * 11}>
              <div style={{ fontSize: 21, color: COLORS.ink }}>
                <span style={{ color: COLORS.primary, marginRight: 10 }}>→</span>
                {a}
              </div>
            </Appear>
          ))}
          <Appear at={158}>
            <div
              style={{
                marginTop: 6,
                display: "inline-block",
                padding: "10px 18px",
                borderRadius: 999,
                background: "#e7f6ee",
                color: COLORS.success,
                fontSize: 21,
                fontWeight: 600,
              }}
            >
              ✓ {TK.finding}
            </div>
          </Appear>
        </div>
      </div>
    </Stage>
  );
};

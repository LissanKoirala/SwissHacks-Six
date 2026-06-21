/**
 * WfBoard — the kanban scene, rendered in the Wordsmith `TasksDemo` style: a
 * single hero advisory card glides through Signal → Strategy → Dialogue →
 * Delivered with exaggerated drag-and-drop motion (lift, rotate, big shadow,
 * spring landing), a camera that follows the active column with a tight zoom,
 * destination-column ring highlights, a cross-fading description, and a
 * completion celebration on the final drop. Lives as one scene inside the
 * full Workflow sequence, so it owns its own enter/exit fade.
 */

import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, MONO } from "../../theme";
import { FONT } from "../../fonts";
import { SCHNEIDER } from "../../content";
import { enterExit, SwissLogo } from "../../ui";

// ---------------------------------------------------------------------------
// Timing (frames reset to 0 at the start of this scene's Sequence)
// ---------------------------------------------------------------------------

interface MoveSpec {
  startS: number;
  duration: number;
  fromColumn: 0 | 1 | 2 | 3;
  toColumn: 1 | 2 | 3;
}

const INTRO_S = 1.0;
const HOLD_S = 2.4; // dwell per column — longer so the description reads
const MOVE_S = 1.5; // slower travel + cross-fade
const PICKUP_FRAC = 0.3;
const TRAVEL_FRAC = 0.5;
const DROP_FRAC = 0.2;
const CELEBRATE_HOLD_S = 2.8;

const MOVE_START_1 = INTRO_S + HOLD_S; // 2.7
const MOVE_START_2 = MOVE_START_1 + MOVE_S + HOLD_S; // 5.7
const MOVE_START_3 = MOVE_START_2 + MOVE_S + HOLD_S; // 8.7
const FINAL_LAND_S = MOVE_START_3 + MOVE_S; // 9.9
const END_S = FINAL_LAND_S + CELEBRATE_HOLD_S; // 12.3

// The scene should be at least this long for the whole animation to play.
export const WF_BOARD_DURATION = Math.ceil(30 * (END_S + 0.6));

const MOVES: MoveSpec[] = [
  { startS: MOVE_START_1, duration: MOVE_S, fromColumn: 0, toColumn: 1 },
  { startS: MOVE_START_2, duration: MOVE_S, fromColumn: 1, toColumn: 2 },
  { startS: MOVE_START_3, duration: MOVE_S, fromColumn: 2, toColumn: 3 },
];

interface ColumnDef {
  key: string;
  label: string;
  description: string;
}

const COLUMNS: ColumnDef[] = [
  { key: "signal", label: "Signal", description: "Biogen conflicts with his neuro-research stance" },
  { key: "strategy", label: "Strategy", description: "SWAP → Eli Lilly · CHF 101,097 · CIO-approved" },
  { key: "dialogue", label: "Dialogue", description: "Drafted — empathetic, mission-driven outreach" },
  { key: "delivered", label: "Delivered", description: "Sent · risk 0.62 → 0.19 — values fit restored" },
];

const COLOR = {
  foreground: COLORS.ink,
  mutedForeground: COLORS.inkSoft,
  border: COLORS.border,
  borderSoft: "rgba(237, 237, 237, 0.7)",
  cardBg: COLORS.card,
  primary: COLORS.primary,
  primarySubtle: COLORS.primarySubtle,
  columnBg: "rgba(250, 250, 250, 0.7)",
  countPillBg: "#f0f0f0",
  destructiveBg: "#fde8e9",
  destructiveFg: COLORS.destructive,
  successBg: "#e7f6ee",
  successFg: COLORS.success,
} as const;

const CANVAS_W = 1920;
const CANVAS_H = 1080;

const BOARD_TOP = 220;
const BOARD_HEIGHT = 720;
const COLUMN_WIDTH = 430;
const COLUMN_GAP = 28;
const BOARD_TOTAL_WIDTH = COLUMN_WIDTH * 4 + COLUMN_GAP * 3;
const BOARD_LEFT = (CANVAS_W - BOARD_TOTAL_WIDTH) / 2;

const CARD_WIDTH = COLUMN_WIDTH - 28;
const CARD_INSET_X = 14;
const CARD_TOP_IN_COLUMN = 74;

const columnCenterX = (i: number): number =>
  BOARD_LEFT + i * (COLUMN_WIDTH + COLUMN_GAP) + COLUMN_WIDTH / 2;
const columnLeft = (i: number): number => BOARD_LEFT + i * (COLUMN_WIDTH + COLUMN_GAP);
const cardRestX = (i: number): number => columnLeft(i) + CARD_INSET_X;
const cardRestY = BOARD_TOP + CARD_TOP_IN_COLUMN;

interface CardMotion {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  shadowBoost: number;
  inFlight: boolean;
  fromColumn: number;
  toColumn: number;
  textBlend: number;
  hotColumn: number | null;
  hotIntensity: number;
}

function computeCardMotion(currentS: number): CardMotion {
  let column = 0;
  for (const m of MOVES) if (currentS >= m.startS + m.duration) column = m.toColumn;

  const activeMove = MOVES.find(
    (m) => currentS >= m.startS && currentS < m.startS + m.duration,
  );

  if (!activeMove) {
    return {
      x: cardRestX(column),
      y: cardRestY,
      rotate: 0,
      scale: 1,
      shadowBoost: 0,
      inFlight: false,
      fromColumn: column,
      toColumn: column,
      textBlend: 0,
      hotColumn: null,
      hotIntensity: 0,
    };
  }

  const moveProgress = (currentS - activeMove.startS) / activeMove.duration;
  const { fromColumn, toColumn } = activeMove;
  const pickupEnd = PICKUP_FRAC;
  const travelEnd = PICKUP_FRAC + TRAVEL_FRAC;

  let phase: "pickup" | "travel" | "drop";
  let phaseT: number;
  if (moveProgress < pickupEnd) {
    phase = "pickup";
    phaseT = moveProgress / pickupEnd;
  } else if (moveProgress < travelEnd) {
    phase = "travel";
    phaseT = (moveProgress - pickupEnd) / TRAVEL_FRAC;
  } else {
    phase = "drop";
    phaseT = (moveProgress - travelEnd) / DROP_FRAC;
  }

  const xFrom = cardRestX(fromColumn);
  const xTo = cardRestX(toColumn);

  let lift = 0;
  let rotate = 0;
  let scale = 1;
  let shadowBoost = 0;
  let textBlend = 0;
  let x = xFrom;
  let hotColumn: number | null = null;
  let hotIntensity = 0;

  if (phase === "pickup") {
    const eased = Easing.out(Easing.cubic)(phaseT);
    lift = eased * -28;
    rotate = eased * -6;
    scale = 1 + eased * 0.1;
    shadowBoost = eased;
    x = xFrom + eased * 8;
    hotColumn = fromColumn;
    hotIntensity = (1 - phaseT) * 0.6;
  } else if (phase === "travel") {
    const eased = Easing.inOut(Easing.cubic)(phaseT);
    lift = -28;
    rotate = -6 + Math.sin(phaseT * Math.PI * 2) * 1.5;
    scale = 1.1;
    shadowBoost = 1;
    x = xFrom + 8 + (xTo - xFrom - 8) * eased;
    hotColumn = toColumn;
    hotIntensity = Math.min(1, phaseT * 1.4);
    textBlend = Math.max(0, Math.min(1, (phaseT - 0.25) / 0.5));
  } else {
    const t = phaseT;
    const overshoot = Math.sin(t * Math.PI) * 0.06;
    const settle = Easing.out(Easing.cubic)(t);
    lift = (1 - settle) * -28;
    rotate = (1 - settle) * -6 + (1 - settle) * 6 * 0.5;
    scale = 1.1 - 0.1 * settle - overshoot;
    shadowBoost = 1 - settle;
    x = xTo;
    textBlend = 1;
    hotColumn = toColumn;
    hotIntensity = Math.max(0, 1 - settle * 1.5) + Math.sin(t * Math.PI) * 0.3;
  }

  return {
    x,
    y: cardRestY + lift,
    rotate,
    scale,
    shadowBoost,
    inFlight: phase !== "drop" || phaseT < 0.5,
    fromColumn,
    toColumn,
    textBlend,
    hotColumn,
    hotIntensity,
  };
}

function columnCount(columnIndex: number, motion: CardMotion): number {
  if (motion.inFlight) return 0;
  return columnIndex === motion.toColumn ? 1 : 0;
}

function computeCameraX(currentS: number): number {
  let column = 0;
  for (const m of MOVES) if (currentS >= m.startS + m.duration) column = m.toColumn;
  const activeMove = MOVES.find(
    (m) => currentS >= m.startS && currentS < m.startS + m.duration,
  );
  if (!activeMove) return columnCenterX(column);
  const t = (currentS - activeMove.startS) / activeMove.duration;
  const eased = Easing.inOut(Easing.cubic)(t);
  return (
    columnCenterX(activeMove.fromColumn) +
    (columnCenterX(activeMove.toColumn) - columnCenterX(activeMove.fromColumn)) * eased
  );
}

interface Particle {
  angle: number;
  distance: number;
  color: string;
  size: number;
  delay: number;
}

const PARTICLE_COLORS = [
  COLORS.primary,
  COLORS.success,
  COLORS.teal,
  COLORS.warning,
  COLORS.purple,
  "#34d399",
];

const PARTICLES: Particle[] = Array.from({ length: 16 }).map((_, i) => {
  const r = (n: number) => {
    const x = Math.sin((i + 1) * n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };
  return {
    angle: -Math.PI / 2 + (r(1) - 0.5) * Math.PI * 1.4,
    distance: 90 + r(2) * 150,
    color: PARTICLE_COLORS[i % PARTICLE_COLORS.length]!,
    size: 7 + r(3) * 9,
    delay: r(4) * 0.15,
  };
});

const IconCheckCircle: React.FC<{ size?: number; color?: string }> = ({
  size = 32,
  color = COLOR.successFg,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="11" fill="#d6f0e1" stroke={color} strokeWidth="1.6" />
    <path
      d="M7 12.5l3.2 3.2L17 8.5"
      stroke={color}
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IconSparkle: React.FC<{ size?: number; color?: string }> = ({
  size = 28,
  color = COLORS.warning,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M12 2.5l1.9 6.1 6.1 1.9-6.1 1.9L12 18.5l-1.9-6.1L4 10.5l6.1-1.9L12 2.5z" fill={color} />
  </svg>
);

const IconDoc: React.FC<{ size?: number; color?: string }> = ({
  size = 13,
  color = COLOR.mutedForeground,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M6 2.5h7L19 8v13a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 21V4a1.5 1.5 0 0 1 1.5-1.5z"
      stroke={color}
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M13 2.5V8h6" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);

interface AdvisoryCardProps {
  fromDescription: string;
  toDescription: string;
  textBlend: number;
  shadowBoost: number;
  stageLabel: string;
  isDelivered: boolean;
}

const AdvisoryCard: React.FC<AdvisoryCardProps> = ({
  fromDescription,
  toDescription,
  textBlend,
  shadowBoost,
  stageLabel,
  isDelivered,
}) => {
  const restingShadow = "0 1px 2px 0 rgba(16,24,40,0.05)";
  const liftedShadow =
    "0 24px 46px -10px rgba(16,24,40,0.22), 0 14px 26px -10px rgba(16,24,40,0.12), 0 0 0 1px rgba(16,24,40,0.04)";
  const shadow = shadowBoost > 0 ? `${liftedShadow}, ${restingShadow}` : restingShadow;

  return (
    <div
      style={{
        width: CARD_WIDTH,
        background: COLOR.cardBg,
        borderRadius: 14,
        boxShadow: `inset 0 0 0 1.5px ${COLOR.border}, ${shadow}`,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontFamily: MONO, fontSize: 14, color: COLOR.mutedForeground, fontWeight: 500 }}>
            ADV-1042
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontSize: 12,
              fontWeight: 700,
              padding: "3px 10px",
              borderRadius: 999,
              background: isDelivered ? COLOR.successBg : COLOR.destructiveBg,
              color: isDelivered ? COLOR.successFg : COLOR.destructiveFg,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: isDelivered ? COLOR.successFg : COLOR.destructiveFg,
              }}
            />
            {isDelivered ? "Resolved" : "Conflict"}
          </span>
        </div>
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 999,
            background: COLOR.primarySubtle,
            color: COLOR.primary,
            fontSize: 12,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            letterSpacing: 0.3,
          }}
        >
          HS
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 19, fontWeight: 600, color: COLOR.foreground, lineHeight: 1.3 }}>
          Biogen Inc. — Mr. Schneider
        </span>
        <div style={{ position: "relative", height: 44 }}>
          <span
            style={{
              position: "absolute",
              inset: 0,
              fontSize: 15,
              lineHeight: 1.35,
              color: COLOR.mutedForeground,
              opacity: 1 - textBlend,
              transform: `translateY(${textBlend * -4}px)`,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {fromDescription}
          </span>
          <span
            style={{
              position: "absolute",
              inset: 0,
              fontSize: 15,
              lineHeight: 1.35,
              color: COLOR.mutedForeground,
              opacity: textBlend,
              transform: `translateY(${(1 - textBlend) * 4}px)`,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {toDescription}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 500,
            padding: "4px 10px",
            borderRadius: 999,
            boxShadow: `inset 0 0 0 1.5px ${COLOR.border}`,
            background: "rgba(245,245,245,0.6)",
            color: COLOR.mutedForeground,
          }}
        >
          <IconDoc size={13} />
          {SCHNEIDER.alert.source}
        </span>
        <span style={{ fontSize: 12, color: COLOR.mutedForeground, fontWeight: 500 }}>Health Care</span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 12,
            fontWeight: 600,
            padding: "3px 10px",
            borderRadius: 999,
            background: COLOR.primarySubtle,
            color: COLOR.primary,
          }}
        >
          {stageLabel}
        </span>
      </div>
    </div>
  );
};

const ColumnView: React.FC<{ label: string; count: number; highlight: number; height: number }> = ({
  label,
  count,
  highlight,
  height,
}) => {
  const bg = highlight > 0 ? `rgba(232, 242, 255, ${0.5 + highlight * 0.4})` : COLOR.columnBg;
  const borderColor =
    highlight > 0 ? `rgba(188, 217, 255, ${0.6 + highlight * 0.4})` : COLOR.borderSoft;
  const ringWidth = highlight * 3;

  return (
    <div
      style={{
        width: COLUMN_WIDTH,
        height,
        borderRadius: 16,
        background: bg,
        boxShadow:
          highlight > 0
            ? `inset 0 0 0 1.5px ${borderColor}, 0 0 0 ${ringWidth}px rgba(0, 96, 223, ${0.16 * highlight})`
            : `inset 0 0 0 1.5px ${borderColor}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "15px 18px",
          borderBottom: `1px solid ${COLOR.borderSoft}`,
        }}
      >
        <span
          style={{
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: highlight > 0.3 ? COLOR.primary : COLOR.foreground,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            padding: "1px 11px",
            borderRadius: 999,
            background: COLOR.countPillBg,
            color: COLOR.mutedForeground,
            fontVariantNumeric: "tabular-nums",
            minWidth: 28,
            textAlign: "center",
          }}
        >
          {count}
        </span>
      </div>
    </div>
  );
};

export const WfBoard: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentS = frame / fps;

  // scene-level cross-dissolve with the neighbouring scenes
  const sceneFade = enterExit(frame, dur, 12);

  const boardOpacity = interpolate(currentS, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });

  const introSpring = spring({
    frame: Math.max(0, frame - Math.round(0.25 * fps)),
    fps,
    config: { damping: 9, stiffness: 130, mass: 0.7, overshootClamping: false },
  });
  const introOpacity = interpolate(introSpring, [0, 0.4, 1], [0, 1, 1], { extrapolateRight: "clamp" });
  const introScale = interpolate(introSpring, [0, 1], [0.4, 1], { extrapolateRight: "clamp" });
  const introLift = interpolate(introSpring, [0, 1], [40, 0], { extrapolateRight: "clamp" });

  const motion = computeCardMotion(currentS);

  const cardOpacity = introOpacity;
  const cardScaleCombined = motion.scale * introScale;

  const fromDesc = COLUMNS[motion.fromColumn]!.description;
  const toDesc = COLUMNS[motion.toColumn]!.description;
  const stageLabel =
    COLUMNS[
      Math.round(motion.fromColumn + (motion.toColumn - motion.fromColumn) * (motion.textBlend > 0.5 ? 1 : 0))
    ]!.label;

  const celebrationT = interpolate(currentS, [FINAL_LAND_S - 0.15, FINAL_LAND_S + 0.9], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const sparkleOpacity = interpolate(
    currentS,
    [FINAL_LAND_S + 0.05, FINAL_LAND_S + 0.4],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const sparkleScale = interpolate(celebrationT, [0, 0.4, 1], [0.2, 1.3, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const completedGlow = interpolate(
    currentS,
    [FINAL_LAND_S, FINAL_LAND_S + 0.5, FINAL_LAND_S + 1.5, END_S],
    [0, 1, 0.5, 0.4],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const columnHighlights = [0, 1, 2, 3].map((i) => (motion.hotColumn === i ? motion.hotIntensity : 0));

  const CAM_SCALE_BASE = 2.7;
  const camScalePunch = interpolate(motion.shadowBoost, [0, 1], [0, 0.08], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const camScale = CAM_SCALE_BASE + camScalePunch;
  const cameraX = computeCameraX(currentS);
  const cameraY = 380;
  const camTranslateX = CANVAS_W / 2 - cameraX * camScale;
  const camTranslateY = CANVAS_H / 2 - cameraY * camScale;

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        fontFamily: FONT,
        color: COLOR.foreground,
        overflow: "hidden",
        opacity: sceneFade,
      }}
    >
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 1400px 900px at 50% 50%, rgba(255,255,255,0) 0%, rgba(240,244,250,0.55) 100%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: "0 0",
          transform: `translate(${camTranslateX}px, ${camTranslateY}px) scale(${camScale})`,
          willChange: "transform",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: BOARD_TOP,
            left: BOARD_LEFT,
            width: BOARD_TOTAL_WIDTH,
            height: BOARD_HEIGHT,
            display: "flex",
            gap: COLUMN_GAP,
            opacity: boardOpacity,
          }}
        >
          {COLUMNS.map((col, i) => (
            <ColumnView
              key={col.key}
              label={col.label}
              count={columnCount(i, motion)}
              highlight={columnHighlights[i]!}
              height={BOARD_HEIGHT}
            />
          ))}
        </div>

        <div
          style={{
            position: "absolute",
            left: motion.x,
            top: motion.y + introLift,
            width: CARD_WIDTH,
            opacity: cardOpacity,
            transform: `rotate(${motion.rotate}deg) scale(${cardScaleCombined})`,
            transformOrigin: "center center",
            zIndex: 10,
            willChange: "transform",
          }}
        >
          {completedGlow > 0 && (
            <div
              style={{
                position: "absolute",
                inset: -8,
                borderRadius: 20,
                boxShadow: `0 0 0 ${completedGlow * 4}px rgba(7, 148, 85, ${completedGlow * 0.18})`,
                pointerEvents: "none",
              }}
            />
          )}

          <AdvisoryCard
            fromDescription={fromDesc}
            toDescription={toDesc}
            textBlend={motion.textBlend}
            shadowBoost={motion.shadowBoost}
            stageLabel={stageLabel}
            isDelivered={currentS >= FINAL_LAND_S}
          />

          <div
            style={{
              position: "absolute",
              top: -10,
              right: -10,
              opacity: sparkleOpacity,
              transform: `scale(${sparkleScale}) rotate(${celebrationT * 90}deg)`,
              pointerEvents: "none",
            }}
          >
            <IconSparkle size={30} />
          </div>

          <div
            style={{
              position: "absolute",
              top: -16,
              left: -16,
              opacity: sparkleOpacity,
              transform: `scale(${sparkleScale * 0.9})`,
              background: "#ffffff",
              borderRadius: 999,
              padding: 2,
              boxShadow: "0 4px 12px rgba(7, 148, 85, 0.25)",
              pointerEvents: "none",
            }}
          >
            <IconCheckCircle size={34} />
          </div>
        </div>

        {celebrationT > 0 && (
          <div
            style={{
              position: "absolute",
              left: cardRestX(3) + CARD_WIDTH / 2,
              top: cardRestY + 90,
              width: 0,
              height: 0,
              pointerEvents: "none",
            }}
          >
            {PARTICLES.map((p, i) => {
              const t = Math.max(0, Math.min(1, (celebrationT - p.delay) / (1 - p.delay)));
              if (t <= 0) return null;
              const eased = Easing.out(Easing.cubic)(t);
              const dx = Math.cos(p.angle) * p.distance * eased;
              const dy = Math.sin(p.angle) * p.distance * eased + eased * eased * 60;
              const fade = 1 - eased;
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    width: p.size,
                    height: p.size,
                    borderRadius: i % 2 === 0 ? 2 : 999,
                    background: p.color,
                    left: dx,
                    top: dy,
                    opacity: fade,
                    transform: `rotate(${eased * 360}deg)`,
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 70,
          textAlign: "center",
          opacity: boardOpacity,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 14,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: COLOR.primary,
          }}
        >
          <span style={{ width: 40, height: 3, background: COLOR.primary, borderRadius: 2 }} />
          Signal → Strategy → Dialogue → Delivered
          <span style={{ width: 40, height: 3, background: COLOR.primary, borderRadius: 2 }} />
        </div>
      </div>
      <SwissLogo />
    </AbsoluteFill>
  );
};

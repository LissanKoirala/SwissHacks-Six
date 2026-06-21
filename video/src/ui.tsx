// Shared building blocks for the pitch scenes — on-brand, motion-aware.
// Editorial restraint: whitespace, one blue accent, subtle springy motion.

import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { COLORS, MONO } from "./theme";
import { FONT } from "./fonts";

/* ----------------------------------------------------------------- motion --- */

const OUT = Easing.out(Easing.cubic);

// Scene-level opacity that fades in at the start and out near the end.
export function enterExit(frame: number, dur: number, pad = 16): number {
  const enter = interpolate(frame, [0, pad], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: OUT,
  });
  const exit = interpolate(frame, [dur - pad, dur], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  return Math.min(enter, exit);
}

// A child that rises + fades in at a given frame offset.
export const Appear: React.FC<{
  at: number;
  y?: number;
  dur?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ at, y = 22, dur = 16, children, style }) => {
  const frame = useCurrentFrame();
  const f = frame - at;
  const o = interpolate(f, [0, dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: OUT,
  });
  const ty = interpolate(f, [0, dur], [y, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: OUT,
  });
  return (
    <div style={{ opacity: o, transform: `translateY(${ty}px)`, ...style }}>
      {children}
    </div>
  );
};

/* -------------------------------------------------------------- primitives --- */

// The pale-blue highlighter band behind a key phrase — the brand's signature.
export const HL: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    style={{
      background: COLORS.primarySubtle,
      color: COLORS.primary,
      padding: "0.02em 0.18em",
      borderRadius: 10,
      // keep the band hugging the text across line breaks
      WebkitBoxDecorationBreak: "clone",
      boxDecorationBreak: "clone",
    }}
  >
    {children}
  </span>
);

export const Kicker: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 14,
      fontSize: 24,
      fontWeight: 600,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color: COLORS.primary,
    }}
  >
    <span style={{ width: 44, height: 3, background: COLORS.primary, borderRadius: 2 }} />
    {children}
  </div>
);

export const Headline: React.FC<{
  children: React.ReactNode;
  size?: number;
  style?: React.CSSProperties;
}> = ({ children, size = 92, style }) => (
  <h1
    style={{
      fontSize: size,
      lineHeight: 1.04,
      fontWeight: 300, // GT Ultra-style light for marquee moments
      letterSpacing: "-0.02em",
      color: COLORS.ink,
      margin: 0,
      maxWidth: 1500,
      ...style,
    }}
  >
    {children}
  </h1>
);

export const Sub: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <p
    style={{
      fontSize: 34,
      lineHeight: 1.4,
      fontWeight: 400,
      color: COLORS.inkSoft,
      margin: 0,
      maxWidth: 1180,
      ...style,
    }}
  >
    {children}
  </p>
);

type Tone = "neutral" | "primary" | "success" | "warning" | "destructive";

const TONE: Record<Tone, { bg: string; fg: string; ring: string }> = {
  neutral: { bg: "#f5f5f5", fg: COLORS.inkSoft, ring: COLORS.border },
  primary: { bg: COLORS.primarySubtle, fg: COLORS.primary, ring: "#cfe2ff" },
  success: { bg: "#e7f6ee", fg: COLORS.success, ring: "#c4e9d5" },
  warning: { bg: "#fdf0db", fg: "#b5680a", ring: "#f6d9a8" },
  destructive: { bg: "#fde8e9", fg: COLORS.destructive, ring: "#f6c4c7" },
};

export const Chip: React.FC<{
  children: React.ReactNode;
  tone?: Tone;
  size?: number;
}> = ({ children, tone = "neutral", size = 28 }) => {
  const t = TONE[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 20px",
        borderRadius: 999,
        background: t.bg,
        color: t.fg,
        boxShadow: `inset 0 0 0 1.5px ${t.ring}`,
        fontSize: size,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
};

// A small "cited source" pill — the provenance motif.
export const ProvPill: React.FC<{ label: string; id: string }> = ({ label, id }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 12,
      padding: "12px 22px",
      borderRadius: 14,
      background: COLORS.card,
      boxShadow: `inset 0 0 0 1.5px ${COLORS.border}`,
      fontSize: 26,
      color: COLORS.ink,
    }}
  >
    <span style={{ width: 12, height: 12, borderRadius: 999, background: COLORS.primary }} />
    <span style={{ fontWeight: 600 }}>{label}</span>
    <span style={{ fontFamily: MONO, fontSize: 22, color: COLORS.inkSoft }}>{id}</span>
  </span>
);

export const Card: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <div
    style={{
      background: COLORS.card,
      borderRadius: 18,
      boxShadow: `inset 0 0 0 1.5px ${COLORS.border}, 0 18px 40px -28px rgba(16,24,40,0.25)`,
      padding: 36,
      ...style,
    }}
  >
    {children}
  </div>
);

// A framed screenshot of the real app — rounded clip, hairline ring, soft
// shadow. `src` is a public/ path (staticFile). Width drives the box; height
// follows the image's aspect ratio.
export const Screenshot: React.FC<{
  src: string;
  width: number;
  ratio: number; // height / width of the source image
  style?: React.CSSProperties;
}> = ({ src, width, ratio, style }) => (
  <div
    style={{
      width,
      height: width * ratio,
      borderRadius: 16,
      overflow: "hidden",
      background: COLORS.card,
      boxShadow: `inset 0 0 0 1.5px ${COLORS.border}, 0 34px 70px -38px rgba(16,24,40,0.5)`,
      ...style,
    }}
  >
    <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
  </div>
);

// A draw-in connector arrow for flows. `progress` 0..1 reveals it.
export const FlowArrow: React.FC<{ progress: number; width?: number }> = ({
  progress,
  width = 90,
}) => {
  const w = Math.max(0, Math.min(1, progress)) * width;
  return (
    <div style={{ display: "flex", alignItems: "center", height: 4 }}>
      <div style={{ height: 4, width: w, background: COLORS.primary, borderRadius: 2 }} />
      <div
        style={{
          width: 0,
          height: 0,
          borderTop: "9px solid transparent",
          borderBottom: "9px solid transparent",
          borderLeft: `14px solid ${COLORS.primary}`,
          opacity: progress > 0.6 ? 1 : 0,
        }}
      />
    </div>
  );
};

export const Wordmark: React.FC = () => (
  <div
    style={{
      position: "absolute",
      left: 140,
      bottom: 64,
      display: "flex",
      alignItems: "center",
      gap: 14,
      fontFamily: FONT,
    }}
  >
    <span style={{ width: 16, height: 16, borderRadius: 5, background: COLORS.primary }} />
    <span style={{ fontSize: 24, fontWeight: 700, color: COLORS.ink, letterSpacing: "-0.01em" }}>
      Everyone&rsquo;s a Billionaire
    </span>
  </div>
);

// Product-fidelity bits — mirror the real dashboard components.
const POLARITY: Record<string, { bg: string; fg: string; label: string }> = {
  conflict: { bg: "#fde8e9", fg: COLORS.destructive, label: "Conflict" },
  opportunity: { bg: "#e7f6ee", fg: COLORS.success, label: "Opportunity" },
  neutral: { bg: "#f5f5f5", fg: COLORS.inkSoft, label: "Neutral" },
};

export const PolarityChip: React.FC<{ polarity: string }> = ({ polarity }) => {
  const p = POLARITY[polarity] ?? POLARITY.neutral;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 9,
        padding: "8px 16px",
        borderRadius: 999,
        background: p.bg,
        color: p.fg,
        fontSize: 24,
        fontWeight: 600,
      }}
    >
      <span style={{ width: 10, height: 10, borderRadius: 999, background: p.fg }} />
      {p.label}
    </span>
  );
};

export const Avatar: React.FC<{ name: string; size?: number }> = ({ name, size = 56 }) => {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: COLORS.primarySubtle,
        color: COLORS.primary,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.38,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
};

export const MetaChip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 16px",
      borderRadius: 999,
      background: "#f5f5f5",
      color: COLORS.inkSoft,
      boxShadow: `inset 0 0 0 1.5px ${COLORS.border}`,
      fontSize: 22,
      fontWeight: 500,
    }}
  >
    {children}
  </span>
);

export const Mono: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ fontFamily: MONO, fontSize: 22, color: COLORS.inkSoft }}>{children}</span>
);

// SwissHacks logo — required top-right mark on every slide (template element).
export const SwissLogo: React.FC = () => (
  <Img
    src={staticFile("swisslogo.png")}
    style={{ position: "absolute", top: 58, right: 140, width: 196, height: "auto" }}
  />
);

/* ------------------------------------------------------------------ stage --- */

// The standard scene frame: white paper, generous margins, persistent wordmark,
// a kicker, and scene-level enter/exit fade.
export const Stage: React.FC<{
  dur: number;
  kicker?: string;
  children: React.ReactNode;
  showWordmark?: boolean;
}> = ({ dur, kicker, children, showWordmark = true }) => {
  const frame = useCurrentFrame();
  const opacity = enterExit(frame, dur);
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, fontFamily: FONT, color: COLORS.ink }}>
      <AbsoluteFill style={{ padding: "120px 140px", opacity }}>
        {kicker ? (
          <Appear at={0} y={14}>
            <Kicker>{kicker}</Kicker>
          </Appear>
        ) : null}
        <div style={{ marginTop: kicker ? 56 : 0, display: "flex", flexDirection: "column", flex: 1 }}>
          {children}
        </div>
      </AbsoluteFill>
      {showWordmark ? (
        <div style={{ opacity }}>
          <Wordmark />
        </div>
      ) : null}
      <SwissLogo />
    </AbsoluteFill>
  );
};

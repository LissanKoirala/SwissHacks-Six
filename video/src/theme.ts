// Wordsmith brand tokens (mirrors frontend/DESIGN.md). One confident blue,
// hue-neutral greys, white paper. No gradients, glows or decorative colour.

export const COLORS = {
  bg: "#ffffff",
  ink: "#181818",
  inkSoft: "#737373", // muted-foreground (0 0% 45%)
  inkFaint: "#a3a3a3",
  primary: "#0060df", // Wordsmith Blue — the sole action colour
  primaryStrong: "#0048a8",
  primarySubtle: "#e8f2ff", // highlight band
  border: "#ededed",
  card: "#ffffff",
  // semantic finance colours — used only for meaning
  success: "#079455",
  warning: "#f79009",
  destructive: "#e7000b",
  // brand accents — distinct categories only
  teal: "#009587",
  purple: "#8600fa",
} as const;

// DM Sans is the workhorse; loaded from @remotion/google-fonts in fonts.ts.
// The stack falls back gracefully if the font isn't available at render time.
export const MONO = `ui-monospace, SFMono-Regular, Menlo, monospace`;

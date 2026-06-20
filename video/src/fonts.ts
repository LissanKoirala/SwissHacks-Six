// DM Sans via Remotion's Google Fonts loader (bundled at render time). The stack
// degrades to system fonts if the package isn't installed / available offline.
import { loadFont } from "@remotion/google-fonts/DMSans";

// Only the weights/subset the scenes actually use — keeps render fast.
const loaded = loadFont("normal", {
  weights: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
});

export const FONT = `${loaded.fontFamily}, Inter, system-ui, -apple-system, "Segoe UI", sans-serif`;

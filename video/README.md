# Advisory Workbench — Pitch Video (Remotion)

An animated, on-brand pitch video for the Advisory Workbench, built with
[Remotion](https://remotion.dev). Self-contained: it does not import from the
app and has its own dependencies, so it never touches `frontend/` or `backend/`.

## Run

```bash
cd video
npm install
npm run dev      # opens Remotion Studio (live preview + scrubbing)
```

Render to MP4 (needs the bundled headless Chromium Remotion downloads on first run):

```bash
npm run render          # → out/pitch.mp4  (1920×1080, 30fps)
npm run still           # → out/poster.png (a single frame, for slides)
```

## Structure

```
src/
  index.ts          registerRoot
  Root.tsx          <Composition id="Pitch" …>  (1920×1080 @ 30fps)
  PitchVideo.tsx    sequences the scenes; SCENES[] = single source of truth for order + duration
  theme.ts          Wordsmith brand tokens (colours)
  fonts.ts          DM Sans via @remotion/google-fonts (falls back to system stack)
  ui.tsx            shared primitives: Stage, Headline, HL (highlight band), Chip,
                    ProvPill, FlowArrow, Appear (staggered entrance), enterExit (scene fade)
  scenes/           one file per scene (Title, Problem, Solution, Pipeline, Trust,
                    Twin, Schneider, Features, Outro)
```

## Story beats

Title → Problem → Solution (dual output) → How it works (pipeline) →
Trust & provenance → Client digital twin → the Schneider vertical slice →
capabilities → outro. ~55s total.

## Extend

- **Reorder / retime:** edit `SCENES` in `PitchVideo.tsx` (component + `dur` in frames).
  `TOTAL_FRAMES` and the composition length update automatically.
- **New scene:** add `src/scenes/MyScene.tsx` exporting `const MyScene: React.FC<{ dur: number }>`
  that renders inside `<Stage dur={dur} kicker="…">`, then add it to `SCENES`.
- **Staggered entrances:** wrap elements in `<Appear at={frames}>`.
- **Brand:** all colours live in `theme.ts`; the only accent is Wordsmith Blue `#0060df`.

Durations are in frames (30 per second). Keep new copy short — editorial restraint
is the brand.

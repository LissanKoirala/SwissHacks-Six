# Advisory Workbench — Design System

> **Wordsmith — modern professional minimalism, editorial restraint.** White paper, hue-neutral greys, a single confident blue for action, quiet borders and subtle shadows. This file is the guardrail: future work must not regress toward generic shadcn/Tailwind defaults or reintroduce decorative colour.

## Identity

- **Voice:** sober, editorial, data-first. Dense tables and figures lead; decoration is absent.
- **Primary / action:** **Wordsmith Blue (`#0060df`)** is the *sole* primary and action colour. It is never decorative — primary button, active/selected state, links, focus, selection, scrollbar. There is no second action blue.
- **Neutrals:** truly hue-neutral greys (R = G = B; no warm or cool cast). White paper canvas; ink near-black text. Hierarchy steps down the neutral ramp, not by reducing opacity.
- **Borders:** quiet `#ededed` — intentionally close to the surface so containers read as gentle tonal shifts.
- **Accents (sparingly):** teal / purple / amber exist for **distinct semantic meaning only** — never stacked on the same screen, never decorative.
- **No** indigo/violet-as-brand, gradient text, decorative gradients, glassmorphism, glows, emoji-as-icons, or coloured card stripes.

## Token table (HSL roles — `hsl(var(--x))`, keep this pattern so `/opacity` modifiers work)

| Role | Light hex · HSL | Dark hex · HSL |
|---|---|---|
| `background` | `#ffffff` · `0 0% 100%` | `#0b0b0d` · `240 8% 5%` |
| `foreground` | `#181818` · `0 0% 9%` | `#ededed` · `0 0% 93%` |
| `card` / `card-foreground` | `#ffffff` · `0 0% 100%` / `0 0% 9%` | `#141416` · `240 5% 8%` / `0 0% 93%` |
| `popover` / `popover-foreground` | `#ffffff` · `0 0% 100%` / `0 0% 9%` | `#161618` · `240 4% 9%` / `0 0% 93%` |
| `primary` (Wordsmith Blue) | `#0060df` · `214 100% 44%` | `#2f7ce6` · `215 79% 54%` |
| `primary-foreground` | `#ffffff` · `0 0% 100%` | `#ffffff` · `0 0% 100%` |
| `primary-strong` (hover) | `#0048a8` · `214 100% 33%` | `#2566c0` · `215 68% 45%` |
| `primary-subtle` (band) | `#e8f2ff` · `214 100% 95%` | `#15233b` · `218 48% 16%` |
| `secondary` / `secondary-foreground` | `#f5f5f5` · `0 0% 96%` / `0 0% 25%` | `#1b1b1e` · `240 5% 11%` / `0 0% 93%` |
| `muted` / `muted-foreground` | `#f5f5f5` · `0 0% 96%` / `0 0% 45%` | `#1b1b1e` · `240 5% 11%` / `0 0% 63%` |
| `accent` (neutral hover) / `accent-foreground` | `#f5f5f5` · `0 0% 96%` / `0 0% 9%` | `#222226` · `240 6% 14%` / `0 0% 96%` |
| `destructive` / `negative` | `#e7000b` · `357 100% 45%` | `#ef4444` · `0 84% 60%` |
| `success` | `#079455` · `153 91% 30%` | `#10b981` · `160 84% 39%` |
| `warning` | `#f79009` · `34 94% 50%` | `#f59f0a` · `38 92% 50%` |
| `info` | `#1570ef` · `215 87% 51%` | `#4f8ff2` · `216 86% 63%` |
| `border` / `input` | `#ededed` · `0 0% 93%` / `#e5e5e5` · `0 0% 90%` | `#26262a` · `240 5% 16%` / `#2c2c31` · `240 5% 18%` |
| `ring` (= primary) | `#0060df` · `214 100% 44%` | `#2f7ce6` · `215 79% 54%` |
| `surface-1` / `-2` / `-3` | `#ffffff` / `#fafafa` / `#f2f4f7` | `#141416` / `#1b1b1e` / `#222226` |
| `sidebar` / `-foreground` / `-border` | `#fafafa` / `#404040` / `#e4e7ec` | `#0e0e10` / `#c8c8cc` / `#222226` |
| `accent-teal` | `#009587` · `174 100% 29%` | (same) `174 100% 29%` |
| `accent-purple` | `#8600fa` · `272 100% 49%` | (same) `272 100% 49%` |
| `accent-amber` | `#e64d00` · `20 100% 45%` | (same) `20 100% 45%` |
| `hl-blue` / `hl-teal` / `hl-purple` | `#e8f2ff` / `#f1fdfa` / `#f3e8ff` | `#15233b` / `#0c2a27` / `#241338` |

**Radius:** `--radius: 0.625rem` (≈10px) — the Wordsmith default, softer than before. Cards use `rounded-lg`; overlays `rounded-lg`; status pills `rounded-full`. `borderRadius.xl` (≈14px) is available for larger panels. Never `rounded-3xl`.

### Semantic finance colours — strict
`success`/`positive`, `warning`, `negative` exist **only** for financial meaning — gain, drift-breach (vs ±2.0pp), loss. `info` for neutral informational status. Never use them for decoration or generic emphasis.

### Brand accents — strict
`teal` / `purple` / `amber` (Tailwind `text-teal` / `bg-purple` etc.) are reserved for **distinct semantic categories** — e.g. a topic family, a signal class. Never stack more than is meaningful on one screen; never use as decoration. The matching `hl-*` bands tint them for highlight use.

## Type scale

Typefaces:
- **DM Sans** (`font-sans`) — the workhorse for all UI: headlines, body, labels, captions, buttons. Geometric, warm, clear.
- **GT Ultra Median Light** (`font-display`, weight 300) — the hero display voice, used **only at ≥40px** for marquee moments (above-the-fold headline, key value-prop). Never for body, labels, buttons, or anything below 40px — reach for DM Sans there instead.
- **System monospace** (`font-mono`: `ui-monospace, SFMono-Regular, Menlo`) — IDs / tickers / ISIN / Valor / timestamps only.

Hierarchy comes from **weight + colour**, not size alone. Two text colours: `foreground` and `muted-foreground`.

| Token | Classes |
|---|---|
| Hero display (≥40px only) | `font-display text-4xl/5xl font-light tracking-tight` |
| Display | `text-2xl font-semibold tracking-tight` |
| Section | `text-base font-semibold` |
| Body | `text-sm` |
| Eyebrow | `text-xs font-medium tracking-wide text-muted-foreground` (Title Case, sparingly) |
| Micro | `text-[11px]` |

## Signature treatments

- **Highlighter bands** — the brand's headline highlight, a pale tinted band behind key words/figures. Use to spotlight a key term or number in a heading or callout — sparingly.
  - `.hl` — blue band (`primary-subtle` bg, `primary` text). The default.
  - `.hl-teal`, `.hl-purple` — for a term belonging to a teal/purple semantic category. Theme-aware; same radius/padding; `box-decoration-break: clone` so multi-line spans wrap cleanly.
- **Citation marker** — `.citation`: the workbench's trust primitive. Apply to **provenance source ids** (CRM log line, news item id, CIO list row) wherever a fact/suggestion cites its source. Blue subtle chip, medium weight.
- **Blue selection** — `::selection` is Wordsmith Blue on white.
- **Blue focus** — `:focus-visible` outline is Wordsmith Blue at `2px` / `2px` offset; form fields also carry the shadcn `ring-ring` (blue).
- **Blue scrollbar** — `.scroll-thin` (and the global webkit thumb) is a thin blue thumb on a transparent track.

## Rules

- **`tabular-nums` on ALL figures** — prices, CHF, drift, P&L. Right-align numeric table columns. (`tnum` is on globally via `body`.)
- **Mono only** for ISIN/Valor IDs, tickers, and timestamps — never for body or labels.
- **Blue used as action, never decoration:** primary button, links, active/selected, focus, selection. Secondary = neutral `secondary`/ghost/outline (no colour).
- **No emoji as icons.** Lucide React at a consistent 16 (inline) / 20 (in buttons) / 24px (section headers). No mixing icon families.
- **Elevation = subtle shadow + hairline (light), tonal step (dark).**
  - Light: cards carry a subtle `shadow-card`; overlays use `shadow-pop`. Pair with a quiet `border-border`.
  - **Dark: no box-shadow.** Elevation = a lighter `surface`/`popover` step + the hairline border. All primitives carry `dark:shadow-none`.
  - Differentiate card roles by padding/density, not by stacking decoration.
- **Motion:** `transition-[specific-prop]`, never `transition-all`. 120–200ms hover/entrance, 200–250ms overlays. Easing vars `--ease-standard: cubic-bezier(0.16, 1, 0.3, 1)` (expo-out, Tailwind `ease-standard`) and `--ease-in: cubic-bezier(0.7, 0, 0.84, 0)` for exits. No bouncy springs. Respect `prefers-reduced-motion`.
- **Tooltips** are an inverse surface — `bg-foreground text-background` (dark chip in light, light chip in dark), `rounded-sm`.
- **Copy:** UK spelling. Describe what the system did ("Surfaced 3 mandate-relevant signals"), not "AI-powered / seamlessly / effortlessly". No emoji. Empty states name the next action and why it's empty.

## Where things live

- Tokens: `app/globals.css` (`:root` / `.dark`). Re-author here once; components inherit intent.
- Highlight + citation utilities: `app/globals.css` `@layer components` (`.hl`, `.hl-teal`, `.hl-purple`, `.citation`).
- Colour/font/shadow/easing mappings: `tailwind.config.ts` (`primary.strong`/`primary.subtle`, `info`/`teal`/`purple`/`amber`, `shadow-card`/`shadow-pop`, `font-display`).
- Fonts wired in `app/layout.tsx` (DM Sans via `next/font/google`, GT Ultra Median Light via `next/font/local` from `app/fonts/`).
- Theme default: light-first (`app/providers.tsx`), dark toggle retained.
- shadcn primitives: `components/ui/*` — kept in line with the depth/motion rules above.

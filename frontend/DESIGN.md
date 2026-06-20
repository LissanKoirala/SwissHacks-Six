# Advisory Workbench — Design System

> **Zürich — warm editorial.** A relationship-manager workbench should read like a private-banking document, not a SaaS dashboard. Warm paper neutrals, a single evergreen accent, tabular figures, hairline rules. This file is the guardrail: future work must not regress toward shadcn/Tailwind/Inter defaults.

## Identity

- **Voice:** sober, editorial, data-first. Dense tables and figures lead; decoration is absent.
- **Accent:** one evergreen (`primary`), used **sparingly** — primary action and active/selected state only. There is no second accent; "secondary" is the *absence* of colour (ghost / outline).
- **Neutrals:** warm paper, not zinc/slate. Every grey carries a faint warm hue (H ~36–44).
- **No** indigo/violet, gradient text, decorative gradients, glassmorphism, glows, emoji-as-icons, or coloured left-border card stripes.

## Token table (HSL roles — `hsl(var(--x))`, keep this pattern so `/opacity` modifiers work)

| Role | Light hex / HSL | Dark hex / HSL |
|---|---|---|
| `background` | `#f7f5f0` · `43 30% 95%` | `#16140f` · `43 19% 7%` |
| `foreground` | `#1c1a17` · `36 10% 10%` | `#ece9e2` · `42 21% 91%` |
| `card` | `#fffdf8` · `43 100% 99%` | `#1f1c16` · `40 17% 10%` |
| `card-foreground` | `#1c1a17` · `36 10% 10%` | `#ece9e2` · `42 21% 91%` |
| `popover` | `#fffdf8` · `43 100% 99%` | `#262219` · `42 21% 12%` |
| `popover-foreground` | `#1c1a17` · `36 10% 10%` | `#ece9e2` · `42 21% 91%` |
| `primary` (evergreen) | `#2f6b4f` · `152 39% 30%` | `#3f8a67` · `152 37% 39%` |
| `primary-foreground` | `#fbfaf6` · `48 38% 97%` | `#fbfaf6` · `48 38% 97%` |
| `secondary` | `#efece4` · `44 26% 92%` | `#2a261d` · `42 18% 14%` |
| `secondary-foreground` | `#2a2620` · `36 14% 15%` | `#ece9e2` · `42 21% 91%` |
| `muted` | `#efece4` · `44 26% 92%` | `#262219` · `42 21% 12%` |
| `muted-foreground` | `#6f6a5f` · `41 8% 40%` | `#9c9488` · `36 9% 57%` |
| `accent` (neutral hover) | `#ebe7dd` · `43 26% 89%` | `#2c281e` · `43 19% 15%` |
| `accent-foreground` | `#2a2620` · `36 14% 15%` | `#f1eee7` · `42 26% 93%` |
| `destructive` | `#c2453d` · `4 52% 50%` | `#d65c52` · `5 62% 58%` |
| `border` / `input` | `#e4dfd3` · `42 24% 86%` | border `#322d23` `40 18% 17%`, input `#3a3429` `39 17% 19%` |
| `ring` (= primary) | `#2f6b4f` · `152 39% 30%` | `#3f8a67` · `152 37% 39%` |
| `success` / `positive` (gain) | `#2f8f63` · `152 51% 37%` | `#38a574` · `153 49% 43%` |
| `warning` (drift-breach) | `#b07d2b` · `37 61% 43%` | `#c89243` · `36 55% 52%` |
| `negative` (loss) | `#c2453d` · `4 52% 50%` | `#d65c52` · `5 62% 58%` |
| `surface-1` (panels) | `#fffdf8` · `43 100% 99%` | `#1f1c16` · `40 17% 10%` |
| `surface-2` | `#f7f5f0` · `43 30% 95%` | `#262219` · `42 21% 12%` |
| `surface-3` (popovers/deep) | `#efece4` · `44 26% 92%` | `#2d2820` · `37 17% 15%` |
| `sidebar` | `#f3f0e9` · `42 29% 93%` | `#14110b` · `40 29% 6%` |

**Radius:** `--radius: 0.3125rem` (5px). Use `rounded-md`. Never `rounded-2xl`/`rounded-3xl`.

### Semantic finance colours — strict
`success`/`positive`, `warning`, `negative` exist **only** for financial meaning — gain, drift-breach (vs ±2.0pp), loss. Never use them for decoration, generic status, or emphasis.

## Type scale

Typeface: **Hanken Grotesk** (UI sans, `font-sans`). **Geist Mono** (`font-mono`) for IDs/tickers/timestamps only. Hierarchy comes from **weight + colour**, not size alone. Two text colours only: `foreground` and `muted-foreground`.

| Token | Classes |
|---|---|
| Display | `text-2xl font-semibold tracking-tight` |
| Section | `text-base font-semibold` |
| Body | `text-sm` |
| Eyebrow | `text-xs font-medium tracking-wide text-muted-foreground` (Title Case, sparingly — no shouty all-caps) |
| Micro | `text-[11px]` |

## Rules

- **`tabular-nums` on ALL figures** — prices, CHF, drift, P&L. Right-align numeric table columns. (`tnum` is on globally via `body`.)
- **Mono only** for ISIN/Valor IDs, tickers, and timestamps — never for body or labels.
- **Evergreen accent sparingly:** primary button + active/selected only. Secondary = ghost/outline (no colour).
- **No emoji as icons.** Use Lucide at a consistent 16/20px stroke.
- **Elevation via surface step + hairline, not shadow.**
  - Light: a hairline `border-border` *or* a `surface` tone step — not border + wide diffuse shadow on the same element. A subtle `shadow-card` (`0 1px 2px rgba(0,0,0,0.05)`) is permitted on light overlays only.
  - **Dark: no box-shadow.** Elevation = a lighter `surface`/`popover` step + the hairline border. All primitives carry `dark:shadow-none`.
  - Don't border every element; differentiate card roles (data panel ≠ KPI tile ≠ provenance card) by padding/density, not by stacking decoration.
- **Motion:** `transition-[specific-prop]`, never `transition-all`. 120–200ms hover/entrance, 200–250ms overlays. Easing var `--ease-standard: cubic-bezier(0.2, 0, 0, 1)` (Tailwind `ease-standard`). No hover-scale on data rows (use a bg tint). Respect `prefers-reduced-motion`.
- **Signature focus ring:** `ring-2 ring-ring ring-offset-2 ring-offset-background` (evergreen). Utility `.focus-ring` is provided.
- **Overlays** (dialog/sheet) are the *only* place blur is allowed: `bg-background/70 backdrop-blur-[2px]`. Never use blur as a base surface treatment.
- **Copy:** UK spelling. Describe what the system did ("Surfaced 3 mandate-relevant signals"), not "AI-powered / seamlessly / effortlessly". No emoji. Empty states name the next action and why it's empty.

## Where things live

- Tokens: `app/globals.css` (`:root` / `.dark`). Re-author here once; components inherit intent.
- Colour/font/shadow/easing mappings: `tailwind.config.ts`.
- Fonts wired in `app/layout.tsx` (Hanken via `next/font/google`, Geist Mono via `geist/font/mono`).
- shadcn primitives: `components/ui/*` — kept in line with the depth/motion rules above.

"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  RiskTimeline as RiskTimelineData,
  RiskPoint,
  RiskBand,
  RiskSignal,
} from "@/lib/types";
import { api } from "@/lib/api";
import { prettyDate } from "@/lib/format";
import { Provenance } from "./Provenance";

/* ------------------------------------------------------------- chart consts --- */
/* Hand-rolled SVG scrubber. Time on x (true date scale start_date..end_date),
 * risk 0..1 inverted on y. Responsive width via ResizeObserver, exactly like
 * DecisionFlow. Light theme only. */

const PAD_L = 38; // y-axis gutter (risk % labels)
const PAD_R = 14;
const PAD_T = 14;
const PAD_B = 30; // x-axis gutter (date labels)
const CHART_H = 248; // inner plot height
const AUTO_MS = 1300; // playhead step interval (gentle replay pace)

// Faint horizontal band tints — defensive (sky/slate), balanced (amber),
// growth (emerald). Literal hex so they read identically server/client.
const BAND_FILL: Record<string, string> = {
  defensive: "#e0f2fe", // sky-100
  balanced: "#fef3c7", // amber-100
  growth: "#d1fae5", // emerald-100
};
const BAND_LABEL_FILL: Record<string, string> = {
  defensive: "#0369a1", // sky-700
  balanced: "#b45309", // amber-700
  growth: "#047857", // emerald-700
};

// Direction → dot colour (risk-relevant moves stand out).
const DIR_HEX: Record<RiskPoint["direction"], string> = {
  up: "#10b981", // emerald-500
  down: "#f43f5e", // rose-500
  flat: "#94a3b8", // slate-400
};

// Mandate-fit chip styling.
const FIT_META: Record<
  RiskPoint["mandate_fit"],
  { label: string; cls: string; dot: string }
> = {
  aligned: {
    label: "Aligned",
    cls: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    dot: "bg-emerald-500",
  },
  "cautious-drift": {
    label: "Cautious drift",
    cls: "bg-sky-50 text-sky-700 ring-sky-200",
    dot: "bg-sky-500",
  },
  "risk-on-drift": {
    label: "Risk-on drift",
    cls: "bg-amber-50 text-amber-700 ring-amber-200",
    dot: "bg-amber-500",
  },
};

const ACCENT = "#1f5fa6"; // matches the `accent` token used elsewhere

/* ----------------------------------------------------------------- helpers --- */

function dayMs(iso: string): number {
  // Date-only ISO → epoch ms (UTC midnight). Stable across timezones.
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
}

function pctLabel(score: number): string {
  return `${Math.round(score * 100)}%`;
}

function signedGap(gap: number): string {
  const sign = gap > 0 ? "+" : "";
  return `${sign}${gap.toFixed(3)}`;
}

// Linear scale factory clamped to [0,1] of the domain span.
function makeXScale(
  startMs: number,
  endMs: number,
  innerW: number,
): (ms: number) => number {
  const span = Math.max(1, endMs - startMs);
  return (ms: number) => PAD_L + ((ms - startMs) / span) * innerW;
}

// Risk 0..1 → y (inverted: 1.0 at top, 0.0 at bottom).
function yFor(score: number): number {
  return PAD_T + (1 - score) * CHART_H;
}

interface PlotPoint {
  point: RiskPoint;
  x: number;
  y: number;
  index: number;
}

// Build an SVG path "d" string through a slice of plotted points.
function linePath(pts: PlotPoint[]): string {
  if (pts.length === 0) return "";
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
}

// Closed area under a slice of the line (down to the chart floor).
function areaPath(pts: PlotPoint[]): string {
  if (pts.length === 0) return "";
  const floor = PAD_T + CHART_H;
  const first = pts[0];
  const last = pts[pts.length - 1];
  return (
    `M ${first.x.toFixed(1)},${floor.toFixed(1)} ` +
    pts.map((p) => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") +
    ` L ${last.x.toFixed(1)},${floor.toFixed(1)} Z`
  );
}

// True when the user has asked the OS to reduce motion.
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ---------------------------------------------------------------- the chart --- */

function ScrubberChart({
  data,
  index,
  onScrub,
}: {
  data: RiskTimelineData;
  index: number;
  onScrub: (i: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(680);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(el.clientWidth || 680);
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw) setWidth(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const innerW = Math.max(120, width - PAD_L - PAD_R);
  const height = PAD_T + CHART_H + PAD_B;

  const { plotted, x, startMs, endMs } = useMemo(() => {
    const startMs = dayMs(data.start_date);
    const endMs = dayMs(data.end_date);
    const x = makeXScale(startMs, endMs, innerW);
    const plotted: PlotPoint[] = data.points.map((p, i) => ({
      point: p,
      index: i,
      x: x(dayMs(p.date)),
      y: yFor(p.risk_score),
    }));
    return { plotted, x, startMs, endMs };
  }, [data, innerW]);

  const safeIndex = Math.min(index, plotted.length - 1);
  const head = plotted[safeIndex];
  const solid = plotted.slice(0, safeIndex + 1);
  const faint = plotted.slice(safeIndex); // overlaps head so the line connects

  // Map a click x-position to the nearest point index (dot clicks are exact,
  // but clicking the plot body should still snap to a point).
  function nearestIndex(clientX: number): number {
    const el = wrapRef.current;
    if (!el || plotted.length === 0) return safeIndex;
    const rect = el.getBoundingClientRect();
    const localX = clientX - rect.left;
    let best = 0;
    let bestD = Infinity;
    for (const p of plotted) {
      const d = Math.abs(p.x - localX);
      if (d < bestD) {
        bestD = d;
        best = p.index;
      }
    }
    return best;
  }

  // y gridlines at 0 / 25 / 50 / 75 / 100 %.
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  // x date ticks: start, end, plus the two interior quartiles.
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => startMs + (endMs - startMs) * f);

  return (
    <div ref={wrapRef} className="relative w-full" style={{ minHeight: height }}>
      <svg
        width={width}
        height={height}
        className="block"
        role="img"
        aria-label={`Risk appetite of ${data.client_name} over time, from ${prettyDate(
          data.start_date,
        )} to ${prettyDate(data.end_date)}`}
      >
        {/* mandate band tints (defensive / balanced / growth) */}
        {data.bands.map((b: RiskBand) => {
          const top = yFor(b.hi);
          const bottom = yFor(b.lo);
          return (
            <g key={b.id}>
              <rect
                x={PAD_L}
                y={top}
                width={innerW}
                height={Math.max(0, bottom - top)}
                fill={BAND_FILL[b.id] ?? "#f1f5f9"}
                fillOpacity={0.5}
              />
              <text
                x={PAD_L + 4}
                y={(top + bottom) / 2}
                dominantBaseline="middle"
                className="text-[9px] font-semibold uppercase tracking-wide"
                fill={BAND_LABEL_FILL[b.id] ?? "#64748b"}
                opacity={0.7}
              >
                {b.label}
              </text>
            </g>
          );
        })}

        {/* soft-shaded mandate band lo..hi + dashed baseline */}
        <rect
          x={PAD_L}
          y={yFor(data.band.hi)}
          width={innerW}
          height={Math.max(0, yFor(data.band.lo) - yFor(data.band.hi))}
          fill={ACCENT}
          fillOpacity={0.08}
        />
        <line
          x1={PAD_L}
          x2={PAD_L + innerW}
          y1={yFor(data.baseline)}
          y2={yFor(data.baseline)}
          stroke={ACCENT}
          strokeWidth={1.4}
          strokeDasharray="5 4"
          strokeOpacity={0.7}
        />
        <text
          x={PAD_L + innerW - 2}
          y={yFor(data.baseline) - 4}
          textAnchor="end"
          className="text-[9px] font-medium"
          fill={ACCENT}
          opacity={0.85}
        >
          {data.band.label} baseline · {pctLabel(data.baseline)}
        </text>

        {/* y gridlines + % labels */}
        {yTicks.map((t) => (
          <g key={`y-${t}`}>
            <line
              x1={PAD_L}
              x2={PAD_L + innerW}
              y1={yFor(t)}
              y2={yFor(t)}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
            <text
              x={PAD_L - 6}
              y={yFor(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="text-[9px] tabular-nums"
              fill="#94a3b8"
            >
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}

        {/* x date labels */}
        {xTicks.map((ms, i) => (
          <text
            key={`x-${i}`}
            x={x(ms)}
            y={PAD_T + CHART_H + 16}
            textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
            className="text-[9px]"
            fill="#94a3b8"
          >
            {prettyDate(new Date(ms).toISOString().slice(0, 10))}
          </text>
        ))}

        {/* faint future area + line (everything after the playhead) */}
        <path d={areaPath(faint)} fill={ACCENT} fillOpacity={0.04} />
        <path
          d={linePath(faint)}
          fill="none"
          stroke={ACCENT}
          strokeWidth={1.6}
          strokeOpacity={0.28}
          strokeDasharray="3 3"
        />

        {/* solid past area + line (up to the playhead) */}
        <path d={areaPath(solid)} fill={ACCENT} fillOpacity={0.12} />
        <path
          d={linePath(solid)}
          fill="none"
          stroke={ACCENT}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* playhead vertical marker */}
        {head && (
          <line
            x1={head.x}
            x2={head.x}
            y1={PAD_T}
            y2={PAD_T + CHART_H}
            stroke={ACCENT}
            strokeWidth={1.4}
            strokeOpacity={0.55}
          />
        )}

        {/* event dots — risk-relevant larger, coloured by direction */}
        {plotted.map((p) => {
          const rel = p.point.risk_relevant;
          const isHead = p.index === safeIndex;
          const past = p.index <= safeIndex;
          const r = rel ? 5 : 3.2;
          const hex = DIR_HEX[p.point.direction];
          return (
            <g key={p.point.id}>
              {isHead && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r + 4}
                  fill="none"
                  stroke={ACCENT}
                  strokeWidth={1.6}
                  strokeOpacity={0.5}
                />
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                fill={hex}
                fillOpacity={past ? 1 : 0.35}
                stroke="#fff"
                strokeWidth={1.4}
                className="cursor-pointer"
                onClick={() => onScrub(p.index)}
              >
                <title>
                  {prettyDate(p.point.date)} · {pctLabel(p.point.risk_score)} ·{" "}
                  {p.point.direction}
                </title>
              </circle>
            </g>
          );
        })}

        {/* transparent capture layer: click anywhere snaps to nearest point */}
        <rect
          x={PAD_L}
          y={PAD_T}
          width={innerW}
          height={CHART_H}
          fill="transparent"
          className="cursor-crosshair"
          onClick={(e) => onScrub(nearestIndex(e.clientX))}
        />
      </svg>
    </div>
  );
}

/* ----------------------------------------------------------- playhead bar --- */

function StepButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ring-inset transition-colors ${
        disabled
          ? "cursor-not-allowed bg-slate-50 text-slate-300 ring-slate-200"
          : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function PlayheadBar({
  data,
  index,
  setIndex,
  playing,
  togglePlay,
  canAutoplay,
}: {
  data: RiskTimelineData;
  index: number;
  setIndex: (i: number) => void;
  playing: boolean;
  togglePlay: () => void;
  canAutoplay: boolean;
}) {
  const last = data.points.length - 1;
  const cur = data.points[index];

  // "Major" events = the milestone points (de-risking spikes, mandate crossings,
  // the start). Map them to indices for the skip-to-major transport controls.
  const majorIdx = useMemo(() => {
    const byId = new Map(data.points.map((p, i) => [p.id, i] as const));
    const set = new Set<number>();
    data.milestones.forEach((m) => {
      const i = byId.get(m.point_id);
      if (i !== undefined) set.add(i);
    });
    return [...set].sort((a, b) => a - b);
  }, [data]);
  const prevMajor = [...majorIdx].reverse().find((i) => i < index);
  const nextMajor = majorIdx.find((i) => i > index);

  return (
    <div className="flex items-center gap-3">
      <div className="flex shrink-0 items-center gap-1.5">
        <StepButton
          onClick={() => prevMajor !== undefined && setIndex(prevMajor)}
          disabled={prevMajor === undefined}
          label="Previous major event"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <rect x="3" y="3" width="2" height="10" rx="1" />
            <path d="M13 3.4 6.8 8 13 12.6z" />
          </svg>
        </StepButton>
        <StepButton
          onClick={() => setIndex(Math.max(0, index - 1))}
          disabled={index <= 0}
          label="Previous entry"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <path d="M10.5 3.4 4.3 8l6.2 4.6z" />
          </svg>
        </StepButton>
        <button
          type="button"
          onClick={togglePlay}
          disabled={!canAutoplay}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ring-inset transition-colors ${
            canAutoplay
              ? "bg-primary text-white ring-primary hover:bg-primary/90"
              : "cursor-not-allowed bg-slate-100 text-slate-400 ring-slate-200"
          }`}
          aria-label={playing ? "Pause timeline" : "Play timeline"}
          title={
            canAutoplay
              ? playing
                ? "Pause"
                : "Play"
              : "Autoplay off (reduced motion)"
          }
        >
          {playing ? (
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <rect x="3.5" y="2.5" width="3.2" height="11" rx="1" />
              <rect x="9.3" y="2.5" width="3.2" height="11" rx="1" />
            </svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M4.5 2.8v10.4a.8.8 0 0 0 1.22.68l8.3-5.2a.8.8 0 0 0 0-1.36l-8.3-5.2A.8.8 0 0 0 4.5 2.8Z" />
            </svg>
          )}
        </button>
        <StepButton
          onClick={() => setIndex(Math.min(last, index + 1))}
          disabled={index >= last}
          label="Next entry"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <path d="M5.5 3.4 11.7 8 5.5 12.6z" />
          </svg>
        </StepButton>
        <StepButton
          onClick={() => nextMajor !== undefined && setIndex(nextMajor)}
          disabled={nextMajor === undefined}
          label="Next major event"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <path d="M3 3.4 9.2 8 3 12.6z" />
            <rect x="11" y="3" width="2" height="10" rx="1" />
          </svg>
        </StepButton>
      </div>

      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={Math.max(0, last)}
          value={index}
          step={1}
          onChange={(e) => setIndex(Number(e.target.value))}
          aria-label="Scrub the risk timeline"
          aria-valuetext={`${prettyDate(cur?.date)} — risk ${pctLabel(
            cur?.risk_score ?? 0,
          )}`}
          className="risk-range w-full"
        />
        <div className="mt-1 flex justify-between text-[10px] text-slate-400">
          <span>{prettyDate(data.start_date)}</span>
          <span className="tabular-nums">
            entry {index + 1} / {data.points.length}
          </span>
          <span>{prettyDate(data.end_date)}</span>
        </div>
      </div>

      {/* range thumb/track styling — scoped, light theme, no extra deps */}
      <style jsx>{`
        :global(.risk-range) {
          -webkit-appearance: none;
          appearance: none;
          height: 6px;
          border-radius: 9999px;
          background: #e2e8f0;
          cursor: pointer;
        }
        :global(.risk-range::-webkit-slider-thumb) {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          background: ${ACCENT};
          border: 2px solid #fff;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.25);
        }
        :global(.risk-range::-moz-range-thumb) {
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          background: ${ACCENT};
          border: 2px solid #fff;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.25);
        }
      `}</style>
    </div>
  );
}

/* --------------------------------------------------------------- chips --- */

function MandateFitChip({ point }: { point: RiskPoint }) {
  const m = FIT_META[point.mandate_fit] ?? FIT_META.aligned;
  return (
    <span className={`chip ring-1 ring-inset ${m.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
      <span className="tabular-nums opacity-80">
        gap {signedGap(point.mandate_gap)}
      </span>
    </span>
  );
}

function SignalChip({ signal }: { signal: RiskSignal }) {
  const up = signal.direction === "up";
  const down = signal.direction === "down";
  const cls = up
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : down
    ? "bg-rose-50 text-rose-700 ring-rose-200"
    : "bg-slate-50 text-slate-600 ring-slate-200";
  const arrow = up ? "▲" : down ? "▼" : "■";
  return (
    <span className={`chip ring-1 ring-inset ${cls}`}>
      <span className="text-[9px] leading-none">{arrow}</span>
      {signal.term}
      <span className="tabular-nums opacity-70">
        {signal.weight > 0 ? "+" : ""}
        {signal.weight.toFixed(2)}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------- state panel --- */

// Find the most recent risk-moving entry at or before the playhead — the panel
// always narrates the latest *cause*, even when scrubbed onto a flat note.
function lastMover(points: RiskPoint[], index: number): RiskPoint {
  for (let i = Math.min(index, points.length - 1); i >= 0; i--) {
    if (points[i].risk_relevant) return points[i];
  }
  return points[Math.min(index, points.length - 1)];
}

function StatePanel({
  data,
  index,
}: {
  data: RiskTimelineData;
  index: number;
}) {
  const point = data.points[Math.min(index, data.points.length - 1)];
  const band = data.bands.find(
    (b) => point.risk_score >= b.lo && point.risk_score <= b.hi,
  );
  const mover = useMemo(() => lastMover(data.points, index), [data.points, index]);

  return (
    <div className="card flex h-full flex-col p-4">
      <div className="flex items-baseline justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            As of
          </p>
          <p className="mt-0.5 text-sm font-semibold text-ink">
            {prettyDate(point.date)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums text-ink">
            {pctLabel(point.risk_score)}
          </p>
          <p className="text-[11px] text-slate-500">
            risk appetite · {band?.label ?? "—"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <MandateFitChip point={point} />
        <span className="chip bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">
          {point.modality}
        </span>
        <span className="chip bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">
          {point.contact}
        </span>
      </div>

      {/* latest risk-moving event note + provenance */}
      <div className="mt-4">
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: DIR_HEX[mover.direction] }}
          />
          Latest risk-moving note
          {mover.id !== point.id && (
            <span className="font-normal normal-case text-slate-400">
              · {prettyDate(mover.date)}
            </span>
          )}
        </p>
        <p className="text-sm leading-relaxed text-ink-soft">
          “{mover.note_excerpt}”
        </p>
        {mover.signals.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {mover.signals.map((s, i) => (
              <SignalChip key={`${s.term}-${i}`} signal={s} />
            ))}
          </div>
        )}
        <div className="mt-3">
          <Provenance prov={mover.provenance} />
        </div>
      </div>

      {/* facet changes learned at this entry */}
      {point.facet_changes.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            The desk learned here
          </p>
          <ul className="space-y-1">
            {point.facet_changes.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-ink-soft">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                <span>
                  <span className="font-medium text-slate-500">{f.facet}:</span>{" "}
                  {f.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* accrual counters */}
      <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
        <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-200">
          <p className="text-lg font-semibold tabular-nums text-ink">
            {point.edges_known}
          </p>
          <p className="text-[11px] text-slate-500">interest edges known</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-200">
          <p className="text-lg font-semibold tabular-nums text-ink">
            {point.facets_known}
          </p>
          <p className="text-[11px] text-slate-500">profile facets known</p>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- milestones strip --- */

const MILESTONE_TONE: Record<string, string> = {
  spike: "bg-amber-50 text-amber-700 ring-amber-200 hover:bg-amber-100",
  crossing: "bg-sky-50 text-sky-700 ring-sky-200 hover:bg-sky-100",
  start: "bg-slate-50 text-slate-600 ring-slate-200 hover:bg-slate-100",
};

function MilestonesStrip({
  data,
  onJump,
  activeId,
}: {
  data: RiskTimelineData;
  onJump: (i: number) => void;
  activeId: string;
}) {
  if (data.milestones.length === 0) return null;
  const indexById = new Map(data.points.map((p, i) => [p.id, i]));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Milestones
      </span>
      {data.milestones.map((m) => {
        const idx = indexById.get(m.point_id);
        if (idx === undefined) return null;
        const tone = MILESTONE_TONE[m.kind] ?? MILESTONE_TONE.start;
        const active = m.point_id === activeId;
        return (
          <button
            key={m.point_id}
            type="button"
            onClick={() => onJump(idx)}
            className={`chip ring-1 ring-inset transition-colors ${tone} ${
              active ? "ring-2 ring-primary" : ""
            }`}
            title={`${m.kind} · ${prettyDate(data.points[idx].date)}`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- component --- */

export function RiskTimeline({ clientId }: { clientId: string }) {
  const [data, setData] = useState<RiskTimelineData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const lastClient = useRef<string>("");

  const canAutoplay = !prefersReducedMotion();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setData(null);
    setPlaying(false);
    api
      .riskTimeline(clientId)
      .then((d) => {
        if (!alive) return;
        setData(d);
        // Start scrubbed to the latest entry — the "current" state.
        setIndex(Math.max(0, d.points.length - 1));
        if (lastClient.current !== clientId) lastClient.current = clientId;
      })
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [clientId]);

  // Autoplay: advance one entry every AUTO_MS, stop at the end. Disabled when
  // the OS asks for reduced motion.
  useEffect(() => {
    if (!playing || !data || !canAutoplay) return;
    const last = data.points.length - 1;
    if (index >= last) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIndex((i) => Math.min(last, i + 1)), AUTO_MS);
    return () => clearTimeout(t);
  }, [playing, index, data, canAutoplay]);

  function togglePlay() {
    if (!data || !canAutoplay) return;
    const last = data.points.length - 1;
    // Restart from the beginning when pressing play at the end.
    if (!playing && index >= last) setIndex(0);
    setPlaying((p) => !p);
  }

  function scrubTo(i: number) {
    setPlaying(false);
    setIndex(i);
  }

  if (loading) {
    return (
      <section className="card p-5">
        <p className="text-sm text-slate-500">Loading risk timeline…</p>
      </section>
    );
  }
  if (error) {
    return (
      <section className="card p-5">
        <p className="text-sm text-rose-600">
          Could not load the risk timeline: {error}
        </p>
      </section>
    );
  }
  if (!data) return null;
  if (data.points.length === 0) {
    return (
      <section className="card p-10 text-center">
        <p className="text-sm font-medium text-ink">No dated history yet</p>
        <p className="mt-1 text-sm text-slate-500">
          There are no meeting-log entries to replay for {data.client_name}.
        </p>
      </section>
    );
  }

  const safeIndex = Math.min(index, data.points.length - 1);
  const activeId = data.points[safeIndex].id;

  return (
    <div className="space-y-5">
      {/* headline */}
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Risk appetite over time
          </p>
          <h3 className="mt-0.5 text-base font-semibold leading-snug text-ink">
            {data.client_name} ·{" "}
            <span className="text-ink-soft">{data.mandate} mandate</span>
          </h3>
        </div>
        <p className="ml-auto mt-0.5 max-w-xs text-right text-xs text-slate-500">
          Replay of {data.points.length} CRM entries scored against a risk
          lexicon. Drag the scrubber to see how appetite drifted from the
          mandate.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* chart + scrubber */}
        <section className="card flex flex-col gap-4 p-4">
          <ScrubberChart data={data} index={safeIndex} onScrub={scrubTo} />
          <PlayheadBar
            data={data}
            index={safeIndex}
            setIndex={scrubTo}
            playing={playing}
            togglePlay={togglePlay}
            canAutoplay={canAutoplay}
          />
          {/* legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> risk-on note
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500" /> de-risk note
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-slate-400" /> no signal
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0 w-4 border-t-2 border-dashed border-primary" />{" "}
              mandate baseline
            </span>
          </div>
          <MilestonesStrip data={data} onJump={scrubTo} activeId={activeId} />
        </section>

        {/* state panel */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <StatePanel data={data} index={safeIndex} />
        </aside>
      </div>
    </div>
  );
}

export default RiskTimeline;

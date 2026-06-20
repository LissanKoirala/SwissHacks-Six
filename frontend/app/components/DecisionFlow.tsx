"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Decision,
  DecisionEdge,
  DecisionLayerId,
  DecisionNode,
  Polarity,
} from "@/lib/types";
import { api } from "@/lib/api";
import { ProvenanceList } from "./Provenance";
import { PolarityChip } from "./ui";

/* ------------------------------------------------------------- layout consts --- */
/* Vertical layered flow: layers stack top → bottom as full-width bands, so the
 * canvas fills its column height and never needs horizontal scrolling. Node x
 * positions are derived from the measured container width (responsive). */

const GUTTER = 96; // left rail holding the layer-name pills
const BAND_H = 140; // vertical slot per layer band
const TOP_PAD = 12; // padding above the first band
const BOT_PAD = 12; // padding below the last band
const NODE_H = 98; // node card height
const CARD_W = 192; // preferred node card width (shrinks to fit a crowded band)
const CARD_MIN = 138; // floor for card width

// Per-layer accent — band tint + label pill. Light theme only. Class strings
// are literal so Tailwind's JIT picks them up.
const LAYER_TINT: Record<
  DecisionLayerId,
  { header: string; headerText: string; band: string }
> = {
  notes: {
    header: "bg-indigo-50",
    headerText: "text-indigo-700",
    band: "bg-indigo-50/40",
  },
  dna: {
    header: "bg-violet-50",
    headerText: "text-violet-700",
    band: "bg-violet-50/40",
  },
  signal: {
    header: "bg-sky-50",
    headerText: "text-sky-700",
    band: "bg-sky-50/40",
  },
  holding: {
    header: "bg-teal-50",
    headerText: "text-teal-700",
    band: "bg-teal-50/40",
  },
  candidate: {
    header: "bg-emerald-50",
    headerText: "text-emerald-700",
    band: "bg-emerald-50/40",
  },
  action: {
    header: "bg-primary/10",
    headerText: "text-primary",
    band: "bg-primary/10",
  },
};

// Node card colouring by polarity (falls back to neutral slate).
function nodeTone(polarity?: Polarity | null): {
  border: string;
  ring: string;
} {
  if (polarity === "conflict")
    return { border: "border-amber-200", ring: "hover:ring-amber-300" };
  if (polarity === "opportunity")
    return { border: "border-emerald-200", ring: "hover:ring-emerald-300" };
  return { border: "border-slate-200", ring: "hover:ring-slate-300" };
}

// Connector colour by edge kind — slate by default, warm for flags/triggers.
function edgeColour(kind: DecisionEdge["kind"]): string {
  switch (kind) {
    case "flags":
      return "#d97706"; // amber-600
    case "triggers":
      return "#0284c7"; // sky-600
    case "replaces":
      return "#0d9488"; // teal-600
    case "proposes":
      return "#1f5fa6"; // accent
    case "honors":
      return "#7c3aed"; // violet-600
    case "supports":
    default:
      return "#94a3b8"; // slate-400
  }
}

/* ----------------------------------------------------------------- geometry --- */

interface Placed {
  node: DecisionNode;
  layerIndex: number;
  cardW: number;
  cx: number; // centre x of the card
  cy: number; // centre y of the card
  left: number;
  top: number;
}

function placeNodes(
  decision: Decision,
  width: number
): { placed: Placed[]; byId: Record<string, Placed>; height: number } {
  const order: DecisionLayerId[] = decision.layers.map((l) => l.id);
  const layerIdx: Record<string, number> = {};
  order.forEach((id, i) => (layerIdx[id] = i));

  // Bucket nodes by layer so we can spread multiples across the band.
  const buckets: Record<string, DecisionNode[]> = {};
  for (const n of decision.nodes) {
    (buckets[n.layer] ??= []).push(n);
  }

  const spanLeft = GUTTER;
  const spanRight = Math.max(GUTTER + CARD_MIN, width - 12);
  const span = spanRight - spanLeft;

  const placed: Placed[] = [];
  const byId: Record<string, Placed> = {};
  for (const n of decision.nodes) {
    const li = layerIdx[n.layer] ?? 0;
    const stack = buckets[n.layer];
    const idx = stack.indexOf(n);
    const count = stack.length;
    // Card shrinks if a band is crowded so siblings never overlap.
    const cardW = Math.max(
      CARD_MIN,
      Math.min(CARD_W, span / count - 12)
    );
    const cx = spanLeft + (span * (idx + 1)) / (count + 1);
    const cy = TOP_PAD + li * BAND_H + NODE_H / 2;
    const p: Placed = {
      node: n,
      layerIndex: li,
      cardW,
      cx,
      cy,
      left: cx - cardW / 2,
      top: cy - NODE_H / 2,
    };
    placed.push(p);
    byId[n.id] = p;
  }

  const height = TOP_PAD + order.length * BAND_H + BOT_PAD;
  return { placed, byId, height };
}

// Vertical cubic Bézier from the bottom edge of source to the top edge of target.
function connectorPath(from: Placed, to: Placed): string {
  const x1 = from.cx;
  const y1 = from.top + NODE_H;
  const x2 = to.cx;
  const y2 = to.top;
  const my = (y1 + y2) / 2;
  return `M ${x1},${y1} C ${x1},${my} ${x2},${my} ${x2},${y2}`;
}

/* ------------------------------------------------------------------ node card --- */

function FlowNode({
  placed,
  selected,
  onSelect,
}: {
  placed: Placed;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { node } = placed;
  const tone = nodeTone(node.polarity);
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      className={`absolute flex flex-col rounded-xl border bg-white p-2.5 text-left shadow-card ring-2 ring-transparent transition-all ${tone.border} ${tone.ring} ${
        selected ? "ring-primary shadow-pop" : ""
      }`}
      style={{
        left: placed.left,
        top: placed.top,
        width: placed.cardW,
        height: NODE_H,
      }}
      aria-pressed={selected}
    >
      <span className="line-clamp-2 text-sm font-semibold leading-snug text-ink">
        {node.title}
      </span>
      {node.subtitle && (
        <span className="mt-0.5 line-clamp-1 text-xs text-slate-500">
          {node.subtitle}
        </span>
      )}
      <span className="mt-auto flex items-center gap-1 pt-1 text-[10px] font-medium text-primary">
        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path
            d="M2 6h7M6 3l3 3-3 3"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {node.provenance.length} source
        {node.provenance.length === 1 ? "" : "s"}
      </span>
    </button>
  );
}

/* ---------------------------------------------------------------- the canvas --- */

function FlowCanvas({
  decision,
  selectedId,
  onSelect,
}: {
  decision: Decision;
  selectedId: string | null;
  onSelect: (id: string) => void;
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

  const { placed, byId, height } = useMemo(
    () => placeNodes(decision, width),
    [decision, width]
  );

  return (
    <div ref={wrapRef} className="relative w-full" style={{ minHeight: height }}>
      <div className="relative" style={{ width, minHeight: height }}>
        {/* tinted layer bands + left-rail label pills */}
        {decision.layers.map((l, i) => {
          const tint = LAYER_TINT[l.id];
          const bandTop = TOP_PAD + i * BAND_H;
          return (
            <div key={l.id}>
              <div
                className={`absolute rounded-xl ${tint.band}`}
                style={{
                  left: 0,
                  top: bandTop - 6,
                  width,
                  height: BAND_H - 4,
                }}
              />
              <div
                className={`absolute flex items-center justify-center rounded-lg px-2 py-1 text-center text-[10px] font-semibold uppercase leading-tight tracking-wide ${tint.header} ${tint.headerText}`}
                style={{
                  left: 4,
                  top: bandTop + NODE_H / 2 - 14,
                  width: GUTTER - 16,
                }}
              >
                {l.label}
              </div>
            </div>
          );
        })}

        {/* SVG connectors (behind the cards) */}
        <svg
          className="pointer-events-none absolute inset-0"
          width={width}
          height={height}
          aria-hidden
        >
          <defs>
            {decision.edges.map((e) => {
              const c = edgeColour(e.kind);
              return (
                <marker
                  key={`m-${e.id}`}
                  id={`arrow-${e.id}`}
                  markerWidth="7"
                  markerHeight="7"
                  refX="5.5"
                  refY="3"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M0,0 L6,3 L0,6 Z" fill={c} />
                </marker>
              );
            })}
          </defs>
          {decision.edges.map((e) => {
            const from = byId[e.source];
            const to = byId[e.target];
            if (!from || !to) return null;
            const c = edgeColour(e.kind);
            const d = connectorPath(from, to);
            const active =
              selectedId === e.source || selectedId === e.target;
            const midX = (from.cx + to.cx) / 2;
            const midY = (from.top + NODE_H + to.top) / 2;
            return (
              <g key={e.id}>
                {/* base line */}
                <path
                  d={d}
                  fill="none"
                  stroke={c}
                  strokeWidth={active ? 2.4 : 1.6}
                  strokeOpacity={active ? 0.95 : 0.45}
                  markerEnd={`url(#arrow-${e.id})`}
                />
                {/* flowing particle dashes */}
                <path
                  d={d}
                  fill="none"
                  stroke={c}
                  strokeWidth={active ? 2.4 : 1.6}
                  strokeOpacity={active ? 0.9 : 0.55}
                  strokeLinecap="round"
                  strokeDasharray="1 12"
                  className="decision-flow-dash"
                />
                {/* edge label chip */}
                <foreignObject
                  x={midX - 56}
                  y={midY - 11}
                  width={112}
                  height={22}
                >
                  <div className="flex h-full items-center justify-center">
                    <span
                      className="rounded-full bg-white px-1.5 py-0.5 text-[9px] font-medium leading-none ring-1 ring-inset"
                      style={{ color: c, boxShadow: "0 0 0 1px rgba(255,255,255,0.9)" }}
                    >
                      {e.label}
                    </span>
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>

        {/* node cards (above connectors) */}
        {placed.map((p) => (
          <FlowNode
            key={p.node.id}
            placed={p}
            selected={selectedId === p.node.id}
            onSelect={onSelect}
          />
        ))}

        {/* keyframes for the flowing-dash animation (scoped, no extra deps) */}
        <style jsx>{`
          :global(.decision-flow-dash) {
            animation: decision-flow-move 1.4s linear infinite;
          }
          @keyframes decision-flow-move {
            to {
              stroke-dashoffset: -13;
            }
          }
        `}</style>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- recommendation --- */

function RecommendationBar({ decision }: { decision: Decision }) {
  const r = decision.recommendation;
  const actionCls =
    decision.polarity === "conflict"
      ? "bg-amber-100 text-amber-800 ring-amber-200"
      : decision.polarity === "opportunity"
      ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
      : "bg-slate-100 text-slate-700 ring-slate-200";
  const move =
    r.sell && r.buy
      ? `Sell ${r.sell} → Buy ${r.buy}`
      : r.buy
      ? `Buy ${r.buy}`
      : r.sell
      ? `Review ${r.sell}`
      : null;
  return (
    <div className="card border-l-4 border-l-accent p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`chip ring-1 ring-inset ${actionCls} font-semibold`}
        >
          {r.action}
        </span>
        {move && (
          <span className="text-sm font-semibold text-ink">{move}</span>
        )}
        <span className="ml-auto">
          <PolarityChip polarity={decision.polarity} />
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        {r.rationale}
      </p>
      {r.constraints_checked.length > 0 && (
        <ul className="mt-3 space-y-1">
          {r.constraints_checked.map((c, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-xs text-slate-500"
            >
              <svg
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden
              >
                <path
                  d="M2.5 7.5 6 11l5.5-7"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- side panel --- */

function ProvenancePanel({
  node,
  onClose,
}: {
  node: DecisionNode | null;
  onClose: () => void;
}) {
  if (!node) {
    return (
      <div className="card flex h-full flex-col items-center justify-center p-6 text-center">
        <div className="mb-2 rounded-full bg-slate-100 p-3">
          <svg
            className="h-5 w-5 text-slate-400"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden
          >
            <path
              d="M4 6h12M4 10h12M4 14h7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-ink">Trace the call</p>
        <p className="mt-1 text-xs text-slate-500">
          Select any node in the flow to see the source it is grounded in.
        </p>
      </div>
    );
  }
  return (
    <div className="card flex h-full flex-col p-4">
      <div className="mb-3 flex items-start gap-2 border-b border-slate-200 pb-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {node.layer}
          </p>
          <p className="mt-0.5 text-sm font-semibold leading-snug text-ink">
            {node.title}
          </p>
          {node.subtitle && (
            <p className="mt-0.5 text-xs text-slate-500">{node.subtitle}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      {node.detail && (
        <p className="mb-3 text-sm leading-relaxed text-ink-soft">
          {node.detail}
        </p>
      )}
      <div className="scroll-thin -mr-1 flex-1 overflow-y-auto pr-1">
        {node.provenance.length > 0 ? (
          <ProvenanceList items={node.provenance} />
        ) : (
          <p className="text-xs text-slate-400">
            No direct citation on this node.
          </p>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- component --- */

export function DecisionFlow({ clientId }: { clientId: string }) {
  const [data, setData] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const lastClient = useRef<string>("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    if (lastClient.current !== clientId) {
      setSelectedId(null);
      lastClient.current = clientId;
    }
    api
      .decision(clientId)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [clientId]);

  const selectedNode = useMemo(
    () => data?.nodes.find((n) => n.id === selectedId) ?? null,
    [data, selectedId]
  );

  if (loading) {
    return (
      <p className="p-5 text-sm text-slate-500">Loading decision flow…</p>
    );
  }
  if (error) {
    return (
      <p className="p-5 text-sm text-rose-600">
        Could not load decision flow: {error}
      </p>
    );
  }
  if (!data) return null;

  const isEmpty = data.nodes.length === 0;

  return (
    <div className="space-y-5">
      {/* headline */}
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Why this call
          </p>
          <h3 className="mt-0.5 text-base font-semibold leading-snug text-ink">
            {data.headline}
          </h3>
        </div>
        <span className="ml-auto mt-0.5">
          <PolarityChip polarity={data.polarity} />
        </span>
      </div>

      {isEmpty ? (
        <div className="card flex flex-col items-center justify-center p-10 text-center">
          <div className="mb-3 rounded-full bg-slate-100 p-3">
            <svg
              className="h-6 w-6 text-slate-400"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <path
                d="M5 12h14M12 5v14"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                opacity="0.4"
              />
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="1.4"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-ink">No active decision</p>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            {data.recommendation.rationale}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* flow canvas */}
          <section className="card overflow-hidden p-4">
            <FlowCanvas
              decision={data}
              selectedId={selectedId}
              onSelect={(id) =>
                setSelectedId((cur) => (cur === id ? null : id))
              }
            />
          </section>

          {/* provenance side panel */}
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <div className="lg:h-[420px]">
              <ProvenancePanel
                node={selectedNode}
                onClose={() => setSelectedId(null)}
              />
            </div>
          </aside>
        </div>
      )}

      {/* recommendation summary bar */}
      {!isEmpty && <RecommendationBar decision={data} />}
    </div>
  );
}

export default DecisionFlow;

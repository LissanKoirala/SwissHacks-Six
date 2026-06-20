"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Globe as GlobeData,
  GlobeHolding,
  GlobeEvent,
  GlobeArc,
} from "@/lib/types";
import { api } from "@/lib/api";
import { chf, prettyDate } from "@/lib/format";
import { Provenance, ProvenanceTag } from "./Provenance";

/* The globe.gl instance is only created in the browser (dynamic import inside
 * useEffect) — it touches WebGL/`window` and must never run at SSR. */
type GlobeInstance = {
  (el: HTMLElement): GlobeInstance;
  width(w: number): GlobeInstance;
  height(h: number): GlobeInstance;
  globeImageUrl(url: string): GlobeInstance;
  bumpImageUrl(url: string): GlobeInstance;
  backgroundImageUrl(url: string): GlobeInstance;
  showAtmosphere(b: boolean): GlobeInstance;
  atmosphereColor(c: string): GlobeInstance;
  atmosphereAltitude(a: number): GlobeInstance;
  pointsData(d: GlobePoint[]): GlobeInstance;
  pointLat(fn: (d: GlobePoint) => number): GlobeInstance;
  pointLng(fn: (d: GlobePoint) => number): GlobeInstance;
  pointColor(fn: (d: GlobePoint) => string): GlobeInstance;
  pointAltitude(fn: (d: GlobePoint) => number): GlobeInstance;
  pointRadius(fn: (d: GlobePoint) => number): GlobeInstance;
  pointLabel(fn: (d: GlobePoint) => string): GlobeInstance;
  pointsTransitionDuration(ms: number): GlobeInstance;
  arcsData(d: GlobeArc[]): GlobeInstance;
  arcStartLat(fn: (d: GlobeArc) => number): GlobeInstance;
  arcStartLng(fn: (d: GlobeArc) => number): GlobeInstance;
  arcEndLat(fn: (d: GlobeArc) => number): GlobeInstance;
  arcEndLng(fn: (d: GlobeArc) => number): GlobeInstance;
  arcColor(fn: (d: GlobeArc) => string): GlobeInstance;
  arcLabel(fn: (d: GlobeArc) => string): GlobeInstance;
  arcStroke(n: number): GlobeInstance;
  arcAltitude(n: number): GlobeInstance;
  arcDashLength(n: number): GlobeInstance;
  arcDashGap(n: number): GlobeInstance;
  arcDashInitialGap(fn: () => number): GlobeInstance;
  arcDashAnimateTime(ms: number): GlobeInstance;
  pointOfView(
    pov: { lat?: number; lng?: number; altitude?: number },
    ms?: number,
  ): GlobeInstance;
  controls(): { autoRotate: boolean; autoRotateSpeed: number };
  _destructor?: () => void;
};

type GlobePoint = {
  kind: "holding" | "event" | "news";
  lat: number;
  lng: number;
  label: string;
  color: string;
  altitude: number;
  radius: number;
};

const CAPTION =
  "Bars = holdings (height proportional to weight, colour = verdict); tall pulses = alert signals; low pulses = ambient world news (colour = sentiment); dashed arcs = signal to affected holdings. Every item is cited on the right.";

/* ----------------------------------------------------------- verdict meta --- */

const VERDICT_META: Record<
  GlobeHolding["verdict"],
  { label: string; cls: string; dot: string; hex: string }
> = {
  VIOLATION: {
    label: "Violation",
    cls: "bg-rose-50 text-rose-700 ring-rose-200",
    dot: "bg-rose-500",
    hex: "#f43f5e",
  },
  WATCH: {
    label: "Watch",
    cls: "bg-amber-50 text-amber-700 ring-amber-200",
    dot: "bg-amber-500",
    hex: "#f59e0b",
  },
  OK: {
    label: "OK",
    cls: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    dot: "bg-emerald-500",
    hex: "#34d399",
  },
};

function VerdictChip({ verdict }: { verdict: GlobeHolding["verdict"] }) {
  const m = VERDICT_META[verdict] ?? VERDICT_META.OK;
  return (
    <span className={`chip ring-1 ring-inset ${m.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

const SEVERITY_HEX: Record<GlobeEvent["severity"], string> = {
  high: "#fb7185",
  med: "#f59e0b",
  low: "#22d3ee",
};

/* Ambient world-news pulse colour by sentiment: red = negative, green =
 * positive, cyan = neutral. Dimmer than the alert pulses by design. */
function sentimentHex(score?: number): string {
  if (score == null) return "#38bdf8";
  if (score <= -0.3) return "#fb7185";
  if (score >= 0.3) return "#34d399";
  return "#38bdf8";
}

function sentimentLabel(score?: number): { text: string; cls: string } {
  if (score == null) return { text: "neutral", cls: "text-slate-500" };
  if (score <= -0.3) return { text: "negative", cls: "text-rose-600" };
  if (score >= 0.3) return { text: "positive", cls: "text-emerald-600" };
  return { text: "neutral", cls: "text-slate-500" };
}

/* globe.gl tooltips take an HTML string. Escape interpolated values so a stray
 * `<` in seed copy can never break out into markup (defence in depth). */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* --------------------------------------------------------------- globe --- */

function GlobeCanvas({ data }: { data: GlobeData }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const [dim, setDim] = useState(0);

  // Size the square canvas to the tile width so the globe fills the rounded box.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.floor(el.clientWidth);
      if (w > 0) setDim(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || dim <= 0) return;
    const mount = mountRef.current;
    if (!mount) return;

    let globe: GlobeInstance | null = null;
    let disposed = false;

    (async () => {
      // Dynamic import keeps three/WebGL out of the SSR bundle.
      const Globe = (await import("globe.gl")).default as unknown as () => (
        el: HTMLElement,
      ) => GlobeInstance;
      if (disposed || !mountRef.current) return;

      const holdingPoints: GlobePoint[] = data.holdings.map((h) => ({
        kind: "holding",
        lat: h.lat,
        lng: h.lng,
        label: `<div style="font:12px system-ui;color:#0f172a;background:#fff;padding:6px 8px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.18)">
          <strong>${esc(h.issuer)}</strong><br/>
          ${esc(h.city)}, ${esc(h.country)} · ${esc(chf(h.current_chf))}<br/>
          <span style="color:#64748b">${esc(h.verdict)}</span>
        </div>`,
        color: VERDICT_META[h.verdict]?.hex ?? VERDICT_META.OK.hex,
        altitude: 0.01 + h.weight * 0.18,
        radius: 0.18 + h.weight * 0.5,
      }));

      const eventPoints: GlobePoint[] = data.events.map((e) => ({
        kind: "event",
        lat: e.lat,
        lng: e.lng,
        label: `<div style="font:12px system-ui;color:#0f172a;background:#fff;padding:6px 8px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.18)">
          <strong>${esc(e.summary)}</strong><br/>
          ${esc(e.source)} · ${esc(prettyDate(e.published_at))}<br/>
          <span style="color:#64748b">${esc(e.headline)}</span>
        </div>`,
        color: SEVERITY_HEX[e.severity] ?? SEVERITY_HEX.low,
        altitude: 0.34,
        radius: 0.9,
      }));

      const newsPoints: GlobePoint[] = (data.news ?? []).map((e) => ({
        kind: "news",
        lat: e.lat,
        lng: e.lng,
        label: `<div style="font:12px system-ui;color:#0f172a;background:#fff;padding:6px 8px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.18)">
          <strong>${esc(e.summary)}</strong><br/>
          ${esc(e.source)} · ${esc(e.country)} · ${esc(prettyDate(e.published_at))}<br/>
          <span style="color:#64748b">world news · ${esc(e.headline)}</span>
        </div>`,
        color: sentimentHex(e.sentiment),
        altitude: 0.12,
        radius: 0.42,
      }));

      globe = Globe()(mountRef.current)
        .width(dim)
        .height(dim)
        .globeImageUrl("/textures/earth-night.jpg")
        .bumpImageUrl("/textures/earth-topology.png")
        .backgroundImageUrl("/textures/night-sky.png")
        .showAtmosphere(true)
        .atmosphereColor("#22d3ee")
        .atmosphereAltitude(0.18)
        .pointsData([...holdingPoints, ...eventPoints, ...newsPoints])
        .pointLat((d: GlobePoint) => d.lat)
        .pointLng((d: GlobePoint) => d.lng)
        .pointColor((d: GlobePoint) => d.color)
        .pointAltitude((d: GlobePoint) => d.altitude)
        .pointRadius((d: GlobePoint) => d.radius)
        .pointLabel((d: GlobePoint) => d.label)
        .pointsTransitionDuration(0)
        .arcsData(data.arcs)
        .arcStartLat((d: GlobeArc) => d.from_lat)
        .arcStartLng((d: GlobeArc) => d.from_lng)
        .arcEndLat((d: GlobeArc) => d.to_lat)
        .arcEndLng((d: GlobeArc) => d.to_lng)
        .arcColor((d: GlobeArc) => d.color)
        .arcLabel((d: GlobeArc) => d.label)
        .arcStroke(0.6)
        .arcAltitude(0.22)
        .arcDashLength(0.45)
        .arcDashGap(0.18)
        .arcDashInitialGap(() => Math.random())
        .arcDashAnimateTime(2600);

      globeRef.current = globe;

      const controls = globe.controls();
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.32;

      const focus = data.events[0] ?? data.holdings[0];
      if (focus) {
        globe.pointOfView(
          { lat: focus.lat, lng: focus.lng, altitude: 2.2 },
          0,
        );
      }
    })();

    return () => {
      disposed = true;
      globeRef.current = null;
      try {
        globe?._destructor?.();
      } catch {
        /* noop */
      }
      if (mount) mount.replaceChildren();
    };
  }, [data, dim]);

  useEffect(() => {
    if (dim > 0) globeRef.current?.width(dim).height(dim);
  }, [dim]);

  return (
    <div
      ref={wrapRef}
      className="w-full overflow-hidden rounded-xl bg-slate-900"
    >
      <div
        ref={mountRef}
        className="block w-full [&>canvas]:!block [&>canvas]:!h-full [&>canvas]:!w-full"
        style={{
          width: dim > 0 ? dim : "100%",
          height: dim > 0 ? dim : undefined,
          aspectRatio: dim > 0 ? undefined : "1 / 1",
        }}
        aria-label="3D globe of portfolio holdings, news events and signal arcs"
      />
      <p className="border-t border-slate-800 px-4 py-3 text-center text-[11px] leading-relaxed text-slate-400">
        {CAPTION}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------- side lists --- */

function HoldingRow({ holding }: { holding: GlobeHolding }) {
  const flagged = holding.verdict !== "OK";
  return (
    <div
      className={`rounded-lg border p-3 ${
        holding.verdict === "VIOLATION"
          ? "border-rose-200 bg-rose-50/40"
          : holding.verdict === "WATCH"
          ? "border-amber-200 bg-amber-50/40"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-semibold text-ink">
          {holding.issuer}
        </span>
        {flagged && <VerdictChip verdict={holding.verdict} />}
        <span className="ml-auto text-sm font-semibold tabular-nums text-ink">
          {chf(holding.current_chf)}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
        <span>
          {holding.city}, {holding.country}
        </span>
        {holding.industry_group && <span>· {holding.industry_group}</span>}
        <span className="font-mono text-[11px] text-slate-400">
          {holding.isin}
        </span>
        {holding.provenance && (
          <ProvenanceTag prov={holding.provenance} label="src" />
        )}
      </div>
    </div>
  );
}

function EventCard({ event }: { event: GlobeEvent }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink">{event.summary}</span>
        <span className="ml-auto text-[11px] text-slate-400">
          {prettyDate(event.published_at)}
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        {event.headline}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-slate-500">
        {event.source} · {event.country} ·{" "}
        {event.linked_holding_ids.length} linked holding
        {event.linked_holding_ids.length === 1 ? "" : "s"}
        {event.provenance && (
          <ProvenanceTag prov={event.provenance} label="source" />
        )}
      </p>
    </div>
  );
}

function NewsRow({ item }: { item: GlobeEvent }) {
  const senti = sentimentLabel(item.sentiment);
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-sm font-medium leading-snug text-ink">{item.summary}</p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-slate-500">
        {item.source} · {item.country} ·{" "}
        <span className={senti.cls}>{senti.text}</span>
        {item.provenance && (
          <ProvenanceTag prov={item.provenance} label="source" />
        )}
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- panel --- */

export function InvestmentGlobe({ clientId }: { clientId: string }) {
  const [data, setData] = useState<GlobeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setData(null);
    api
      .globe(clientId)
      .then((g) => alive && setData(g))
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [clientId]);

  // Flagged first, then by value — so the side list mirrors what the globe stresses.
  const holdings = useMemo(() => {
    if (!data) return [];
    const order: Record<GlobeHolding["verdict"], number> = {
      VIOLATION: 0,
      WATCH: 1,
      OK: 2,
    };
    return [...data.holdings].sort(
      (a, b) =>
        order[a.verdict] - order[b.verdict] || b.current_chf - a.current_chf,
    );
  }, [data]);

  if (loading) {
    return (
      <section className="card p-5">
        <p className="text-sm text-slate-500">Loading investment map…</p>
      </section>
    );
  }
  if (error) {
    return (
      <section className="card p-5">
        <p className="text-sm text-rose-600">
          Could not load the investment map: {error}
        </p>
      </section>
    );
  }
  if (!data) return null;

  const { stats } = data;
  const flagged = stats.violations + stats.watches;

  return (
    <section className="card flex flex-col">
      <header className="border-b border-slate-200 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">
          Investment map
        </p>
        <h2 className="mt-1 text-sm font-medium leading-snug text-ink-soft">
          {stats.holdings} holding{stats.holdings === 1 ? "" : "s"} ·{" "}
          {flagged > 0 ? (
            <span className="font-semibold text-rose-700">
              {stats.violations} violation
              {stats.violations === 1 ? "" : "s"}, {stats.watches} watch
              {stats.watches === 1 ? "" : "es"}
            </span>
          ) : (
            <span className="text-emerald-700">no live conflicts</span>
          )}{" "}
          · {stats.events} signal{stats.events === 1 ? "" : "s"} ·{" "}
          {stats.news} world-news pulse{stats.news === 1 ? "" : "s"}
        </h2>
      </header>

      <div className="grid gap-5 p-5 lg:grid-cols-2">
        <div className="w-full lg:sticky lg:top-5 lg:self-start">
          {data.holdings.length > 0 ? (
            <GlobeCanvas data={data} />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-slate-900 text-sm text-slate-400">
              No holdings to map.
            </div>
          )}
        </div>

        <div className="space-y-4">
          {data.events.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Live signals
              </p>
              <div className="space-y-3">
                {data.events.map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            </div>
          )}

          {data.news && data.news.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                World news · {data.news.length}
              </p>
              <div className="scroll-thin max-h-[300px] space-y-2 overflow-y-auto pr-1">
                {data.news.map((e) => (
                  <NewsRow key={e.id} item={e} />
                ))}
              </div>
            </div>
          )}

          {data.holdings.length === 0 ? (
            <p className="text-sm text-slate-500">
              No holdings to show on the map.
            </p>
          ) : (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Holdings by location
              </p>
              <div className="scroll-thin max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {holdings.map((h) => (
                  <HoldingRow key={h.id} holding={h} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Globe2,
  MapPin,
  Newspaper,
  Pause,
  Play,
} from "lucide-react";
import type {
  Globe as GlobeData,
  GlobeHolding,
  GlobeEvent,
  GlobeArc,
} from "@/lib/types";
import { api } from "@/lib/api";
import { chf, prettyDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProvenanceTag } from "./Provenance";

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
  ringsData(d: GlobeRing[]): GlobeInstance;
  ringLat(fn: (d: GlobeRing) => number): GlobeInstance;
  ringLng(fn: (d: GlobeRing) => number): GlobeInstance;
  ringColor(fn: (d: GlobeRing) => (t: number) => string): GlobeInstance;
  ringMaxRadius(n: number): GlobeInstance;
  ringPropagationSpeed(n: number): GlobeInstance;
  ringRepeatPeriod(n: number): GlobeInstance;
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
  pauseAnimation?: () => void;
  resumeAnimation?: () => void;
  _destructor?: () => void;
};

type GlobePoint = {
  id: string;
  kind: "holding" | "event" | "news";
  lat: number;
  lng: number;
  label: string;
  color: string;
  altitude: number;
  radius: number;
};

type GlobeRing = { lat: number; lng: number; color: string };

const ROTATE_MS = 6000; // dwell time per story before advancing

/* ----------------------------------------------------------- verdict meta --- */

const VERDICT_META: Record<
  GlobeHolding["verdict"],
  { label: string; cls: string; dot: string; hex: string }
> = {
  VIOLATION: { label: "Violation", cls: "bg-negative/10 text-negative ring-negative/20", dot: "bg-negative", hex: "#d65c52" },
  WATCH: { label: "Watch", cls: "bg-warning/10 text-warning ring-warning/20", dot: "bg-warning", hex: "#c89243" },
  OK: { label: "OK", cls: "bg-success/10 text-success ring-success/20", dot: "bg-success", hex: "#38a574" },
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
  high: "#d65c52",
  med: "#c89243",
  low: "#2f7ce6",
};

function sentimentHex(score?: number): string {
  if (score == null) return "#9c9488";
  if (score <= -0.3) return "#d65c52";
  if (score >= 0.3) return "#38a574";
  return "#9c9488";
}

function sentimentLabel(score?: number): { text: string; cls: string } {
  if (score == null) return { text: "neutral", cls: "text-muted-foreground" };
  if (score <= -0.3) return { text: "negative", cls: "text-negative" };
  if (score >= 0.3) return { text: "positive", cls: "text-positive" };
  return { text: "neutral", cls: "text-muted-foreground" };
}

// The colour a story contributes to the map (its marker, impact arcs, ring).
function storyHex(s: GlobeEvent): string {
  if (s.kind === "ambient" || (s.sentiment != null && !s.severity)) {
    return sentimentHex(s.sentiment);
  }
  return SEVERITY_HEX[s.severity] ?? sentimentHex(s.sentiment);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* --------------------------------------------------------------- globe --- */

function GlobeCanvas({
  data,
  active,
  impactArcs,
  impactHoldingIds,
}: {
  data: GlobeData;
  active: GlobeEvent | null;
  impactArcs: GlobeArc[];
  impactHoldingIds: string[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const pointsRef = useRef<GlobePoint[]>([]);
  // Active selection read live by the globe.gl accessors (avoids stale closures).
  const activeRef = useRef<{ id: string | null; linked: Set<string> }>({ id: null, linked: new Set() });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [ready, setReady] = useState(false);

  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  // Measure the hero box (full width × tall) — globe fills it, not a square.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.floor(el.clientWidth);
      const h = Math.floor(el.clientHeight);
      if (w > 0 && h > 0) setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || size.w <= 0 || size.h <= 0) return;
    const mount = mountRef.current;
    if (!mount) return;

    let globe: GlobeInstance | null = null;
    let disposed = false;

    (async () => {
      const Globe = (await import("globe.gl")).default as unknown as () => (el: HTMLElement) => GlobeInstance;
      if (disposed || !mountRef.current) return;

      const card = (title: string, sub: string, foot: string) =>
        `<div style="font:12px system-ui;color:#1c1a17;background:#fffdf8;padding:6px 8px;border-radius:5px;border:1px solid #e4dfd3;box-shadow:0 1px 2px rgba(0,0,0,.05);max-width:240px">
          <strong>${esc(title)}</strong><br/>${esc(sub)}<br/>
          <span style="color:#6f6a5f">${esc(foot)}</span></div>`;

      const holdingPoints: GlobePoint[] = data.holdings.map((h) => ({
        id: h.id, kind: "holding", lat: h.lat, lng: h.lng,
        label: card(h.issuer, `${h.city}, ${h.country} · ${chf(h.current_chf)}`, h.verdict),
        color: VERDICT_META[h.verdict]?.hex ?? VERDICT_META.OK.hex,
        altitude: 0.01 + h.weight * 0.18,
        radius: 0.18 + h.weight * 0.5,
      }));
      const eventPoints: GlobePoint[] = data.events.map((e) => ({
        id: e.id, kind: "event", lat: e.lat, lng: e.lng,
        label: card(e.summary, `${e.source} · ${prettyDate(e.published_at)}`, e.headline),
        color: SEVERITY_HEX[e.severity] ?? SEVERITY_HEX.low,
        altitude: 0.34, radius: 0.9,
      }));
      const newsPoints: GlobePoint[] = (data.news ?? []).map((e) => ({
        id: e.id, kind: "news", lat: e.lat, lng: e.lng,
        label: card(e.summary, `${e.source} · ${e.country} · ${prettyDate(e.published_at)}`, `world news · ${e.headline}`),
        color: sentimentHex(e.sentiment),
        altitude: 0.12, radius: 0.42,
      }));
      const points = [...holdingPoints, ...eventPoints, ...newsPoints];
      pointsRef.current = points;

      // Accessors read activeRef so a story change can emphasise without a rebuild.
      const isActive = (d: GlobePoint) => activeRef.current.id === d.id && d.kind !== "holding";
      const isLinked = (d: GlobePoint) => d.kind === "holding" && activeRef.current.linked.has(d.id);
      const radiusOf = (d: GlobePoint) => (isActive(d) ? d.radius * 1.9 : isLinked(d) ? d.radius * 1.7 : d.radius);
      const altOf = (d: GlobePoint) => (isActive(d) ? d.altitude + 0.18 : isLinked(d) ? d.altitude + 0.06 : d.altitude);
      const colorOf = (d: GlobePoint) => {
        const dim = activeRef.current.id && !isActive(d) && !isLinked(d);
        return dim ? `${d.color}66` : d.color; // fade the unrelated when a story is in focus
      };

      globe = Globe()(mountRef.current)
        .width(size.w).height(size.h)
        .globeImageUrl("/textures/earth-night.jpg")
        .bumpImageUrl("/textures/earth-topology.png")
        .backgroundImageUrl("/textures/night-sky.png")
        .showAtmosphere(true)
        .atmosphereColor("#2f7ce6")
        .atmosphereAltitude(0.18)
        .pointsData(points)
        .pointLat((d) => d.lat).pointLng((d) => d.lng)
        .pointColor(colorOf).pointAltitude(altOf).pointRadius(radiusOf)
        .pointLabel((d) => d.label)
        .pointsTransitionDuration(0)
        .ringColor(() => (t: number) => `rgba(47,124,230,${1 - t})`)
        .ringMaxRadius(5)
        .ringPropagationSpeed(2)
        .ringRepeatPeriod(reduceMotion ? 0 : 900)
        .ringLat((d) => d.lat).ringLng((d) => d.lng)
        .ringsData([])
        .arcsData(data.arcs)
        .arcStartLat((d) => d.from_lat).arcStartLng((d) => d.from_lng)
        .arcEndLat((d) => d.to_lat).arcEndLng((d) => d.to_lng)
        .arcColor((d) => d.color).arcLabel((d) => d.label)
        .arcStroke(0.6).arcAltitude(0.22)
        .arcDashLength(0.45).arcDashGap(0.18)
        .arcDashInitialGap(() => Math.random())
        .arcDashAnimateTime(reduceMotion ? 0 : 2200);

      globeRef.current = globe;
      const controls = globe.controls();
      // Story rotation drives the camera; no competing auto-spin when stories exist.
      controls.autoRotate = !reduceMotion && data.events.length + (data.news?.length ?? 0) === 0;
      controls.autoRotateSpeed = 0.3;

      const focus = data.events[0] ?? data.holdings[0];
      if (focus) globe.pointOfView({ lat: focus.lat, lng: focus.lng, altitude: 2.2 }, 0);
      setReady(true);
    })();

    return () => {
      disposed = true;
      globeRef.current = null;
      setReady(false);
      try { globe?._destructor?.(); } catch { /* noop */ }
      if (mount) mount.replaceChildren();
    };
  }, [data, size.w, size.h, reduceMotion]);

  // React to the active story: fly to it, ring it, draw its impact arcs, re-emphasise points.
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !ready) return;
    activeRef.current = { id: active?.id ?? null, linked: new Set(impactHoldingIds) };
    // Re-feed points (fresh array ref) so colour/radius/altitude accessors re-run.
    g.pointsData([...pointsRef.current]);
    g.arcsData(active && impactArcs.length ? impactArcs : data.arcs);
    if (active) {
      g.ringsData([{ lat: active.lat, lng: active.lng, color: storyHex(active) }]);
      g.pointOfView({ lat: active.lat, lng: active.lng, altitude: 1.75 }, reduceMotion ? 0 : 1200);
    } else {
      g.ringsData([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, ready]);

  useEffect(() => {
    if (size.w > 0 && size.h > 0) globeRef.current?.width(size.w).height(size.h);
  }, [size.w, size.h]);

  // Pause the render loop while scrolled off-screen.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const g = globeRef.current;
        if (!g) return;
        if (entry.isIntersecting) g.resumeAnimation?.();
        else g.pauseAnimation?.();
      },
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ready]);

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-[#14110b]">
      <div
        ref={mountRef}
        className="block h-full w-full [&>canvas]:!block [&>canvas]:!h-full [&>canvas]:!w-full"
        aria-label="3D globe of portfolio holdings, news events and signal arcs"
      />
      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#14110b] text-[#9c9488]" aria-hidden>
          <Globe2 className="h-6 w-6 animate-pulse motion-reduce:animate-none" />
          <span className="text-[11px] tracking-wide">Rendering globe…</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------- rotating story overlay --- */

function StoryOverlay({
  stories,
  index,
  paused,
  onPrev,
  onNext,
  onSelect,
  onTogglePause,
  onHoverChange,
  impactCount,
}: {
  stories: GlobeEvent[];
  index: number;
  paused: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSelect: (i: number) => void;
  onTogglePause: () => void;
  onHoverChange: (hovering: boolean) => void;
  impactCount: number;
}) {
  const s = stories[index];
  if (!s) return null;
  const senti = sentimentLabel(s.sentiment);
  const tone = storyHex(s);
  return (
    <div
      className="pointer-events-auto absolute right-4 top-4 z-10 w-[min(92vw,22rem)]"
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      <div className="overflow-hidden rounded-xl border border-white/10 bg-black/55 text-white shadow-pop backdrop-blur-md">
        {/* rotation progress bar */}
        <div className="h-0.5 w-full bg-white/10">
          <div
            key={`${index}-${paused}`}
            className="h-full"
            style={{
              background: tone,
              width: "100%",
              animation: paused ? "none" : `storyProgress ${ROTATE_MS}ms linear`,
              transformOrigin: "left",
            }}
          />
        </div>

        <div className="p-4">
          <div className="flex items-center gap-2">
            <Newspaper className="h-3.5 w-3.5 shrink-0 text-white/60" aria-hidden />
            <span className="text-[11px] font-medium uppercase tracking-wide text-white/60">
              In the news
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: tone }} />
              <span className="text-[11px] tabular-nums text-white/60">
                {index + 1}/{stories.length}
              </span>
            </span>
          </div>

          <p className="mt-2 text-[15px] font-semibold leading-snug">{s.summary}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-white/70">{s.headline}</p>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/55">
            <span>{s.source}</span>
            <span>· {s.country}</span>
            <span>· {prettyDate(s.published_at)}</span>
            <span className="font-medium" style={{ color: tone }}>· {senti.text}</span>
          </div>

          <p className="mt-2 text-[12px] text-white/80">
            {impactCount > 0 ? (
              <>
                <span className="font-semibold" style={{ color: tone }}>
                  {impactCount} holding{impactCount === 1 ? "" : "s"}
                </span>{" "}
                affected — highlighted on the map
              </>
            ) : (
              <span className="text-white/55">No direct portfolio impact</span>
            )}
          </p>

          {/* controls */}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onPrev}
              aria-label="Previous story"
              className="grid h-7 w-7 place-items-center rounded-md text-white/70 ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onTogglePause}
              aria-label={paused ? "Resume rotation" : "Pause rotation"}
              className="grid h-7 w-7 place-items-center rounded-md text-white/70 ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/10 hover:text-white"
            >
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label="Next story"
              className="grid h-7 w-7 place-items-center rounded-md text-white/70 ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="ml-auto flex items-center gap-1">
              {stories.map((st, i) => (
                <button
                  key={st.id}
                  type="button"
                  aria-label={`Story ${i + 1}`}
                  onClick={() => onSelect(i)}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === index ? "w-4 bg-white" : "w-1.5 bg-white/30 hover:bg-white/50",
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- side lists --- */

function HoldingRow({ holding, highlighted }: { holding: GlobeHolding; highlighted: boolean }) {
  const flagged = holding.verdict !== "OK";
  return (
    <div
      className={cn(
        "rounded-md border p-3 transition-shadow",
        holding.verdict === "VIOLATION"
          ? "border-negative/30 bg-negative/[0.06]"
          : holding.verdict === "WATCH"
          ? "border-warning/30 bg-warning/[0.06]"
          : "border-border bg-card",
        highlighted && "ring-2 ring-inset ring-primary",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-semibold text-foreground">{holding.issuer}</span>
        {flagged && <VerdictChip verdict={holding.verdict} />}
        {highlighted && (
          <span className="chip bg-primary/10 text-primary ring-1 ring-inset ring-primary/30">
            in the news
          </span>
        )}
        <span className="ml-auto text-sm font-semibold tabular-nums text-foreground">
          {chf(holding.current_chf)}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
        <span>{holding.city}, {holding.country}</span>
        {holding.industry_group && <span>· {holding.industry_group}</span>}
        <span className="font-mono text-[11px] text-muted-foreground">{holding.isin}</span>
        {holding.provenance && <ProvenanceTag prov={holding.provenance} label="src" />}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- panel --- */

export function InvestmentGlobe({ clientId }: { clientId: string }) {
  const [data, setData] = useState<GlobeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setData(null);
    setIndex(0);
    api
      .globe(clientId)
      .then((g) => alive && setData(g))
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [clientId]);

  // The rotating reel: impactful signals first, then ambient world news.
  const stories = useMemo<GlobeEvent[]>(() => {
    if (!data) return [];
    return [...data.events, ...(data.news ?? [])];
  }, [data]);

  const active = stories[index] ?? null;

  // Holdings the active story touches → arcs + highlights.
  const holdingsById = useMemo(() => {
    const m = new Map<string, GlobeHolding>();
    data?.holdings.forEach((h) => m.set(h.id, h));
    return m;
  }, [data]);

  const impactHoldingIds = useMemo(
    () => (active ? active.linked_holding_ids.filter((id) => holdingsById.has(id)) : []),
    [active, holdingsById],
  );

  const impactArcs = useMemo<GlobeArc[]>(() => {
    if (!active) return [];
    const tone = storyHex(active);
    return impactHoldingIds.map((id) => {
      const h = holdingsById.get(id)!;
      return {
        id: `${active.id}->${id}`,
        from_lat: active.lat, from_lng: active.lng,
        to_lat: h.lat, to_lng: h.lng,
        color: tone, label: `${active.summary} → ${h.issuer}`,
      };
    });
  }, [active, impactHoldingIds, holdingsById]);

  const advance = useCallback(
    (delta: number) => {
      setIndex((i) => (stories.length ? (i + delta + stories.length) % stories.length : 0));
    },
    [stories.length],
  );

  // Auto-rotate the reel (pause on hover or when the user pauses).
  useEffect(() => {
    if (stories.length < 2 || paused || hovering) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => advance(1), ROTATE_MS);
    return () => clearInterval(t);
  }, [stories.length, paused, hovering, advance, index]);

  // Flagged holdings first, then by value.
  const holdings = useMemo(() => {
    if (!data) return [];
    const order: Record<GlobeHolding["verdict"], number> = { VIOLATION: 0, WATCH: 1, OK: 2 };
    return [...data.holdings].sort(
      (a, b) => order[a.verdict] - order[b.verdict] || b.current_chf - a.current_chf,
    );
  }, [data]);

  if (loading) {
    return (
      <section className="card p-5">
        <p className="text-sm text-muted-foreground">Mapping holdings and signals…</p>
      </section>
    );
  }
  if (error) {
    return (
      <section className="card p-5">
        <p className="text-sm text-destructive">Could not load the investment map: {error}</p>
      </section>
    );
  }
  if (!data) return null;

  const { stats } = data;
  const flagged = stats.violations + stats.watches;
  const impactSet = new Set(impactHoldingIds);

  return (
    <section className="space-y-5">
      {/* full-bleed hero map */}
      <div className="card overflow-hidden p-0">
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-5 py-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground">Investment Map</p>
          <h2 className="text-sm leading-snug text-foreground">
            <span className="tabular-nums">{stats.holdings}</span> holding{stats.holdings === 1 ? "" : "s"} ·{" "}
            {flagged > 0 ? (
              <span className="font-semibold tabular-nums text-negative">
                {stats.violations} violation{stats.violations === 1 ? "" : "s"}, {stats.watches} watch{stats.watches === 1 ? "" : "es"}
              </span>
            ) : (
              <span className="text-success">no live conflicts</span>
            )}{" "}
            · <span className="tabular-nums">{stats.events}</span> signal{stats.events === 1 ? "" : "s"} ·{" "}
            <span className="tabular-nums">{stats.news}</span> world-news pulse{stats.news === 1 ? "" : "s"}
          </h2>
        </header>

        <div className="relative h-[72vh] min-h-[460px] w-full">
          {data.holdings.length > 0 ? (
            <>
              <GlobeCanvas
                data={data}
                active={active}
                impactArcs={impactArcs}
                impactHoldingIds={impactHoldingIds}
              />
              {stories.length > 0 && (
                <StoryOverlay
                  stories={stories}
                  index={index}
                  paused={paused}
                  impactCount={impactHoldingIds.length}
                  onPrev={() => advance(-1)}
                  onNext={() => advance(1)}
                  onSelect={setIndex}
                  onTogglePause={() => setPaused((p) => !p)}
                  onHoverChange={setHovering}
                />
              )}
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[#14110b] px-6 text-center text-sm text-[#9c9488]">
              No mapped holdings yet — geocoded positions appear once the portfolio loads.
            </div>
          )}
        </div>
        <p className="border-t border-border px-5 py-3 text-center text-[11px] leading-relaxed text-muted-foreground">
          Bars are holdings (height tracks weight, colour shows verdict); the news reel rotates through
          live signals and world news, flying the globe to each and highlighting the holdings it affects.
        </p>
      </div>

      {/* holdings, full width below the map */}
      {data.holdings.length > 0 && (
        <div className="card p-5">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            Holdings by Location
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {holdings.map((h) => (
              <HoldingRow key={h.id} holding={h} highlighted={impactSet.has(h.id)} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

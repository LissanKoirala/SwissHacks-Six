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
  Insights,
  Match,
} from "@/lib/types";
import { api } from "@/lib/api";
import { issuerInitials, issuerLogoSources } from "@/lib/assets";
import { loadGlobeGl } from "@/lib/loadGlobeGl";
import { publisherLogoSources } from "@/lib/publishers";
import { chf, prettyDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProvenanceTag } from "./Provenance";
import { LinkPreviewThumb } from "./LinkPreviewThumb";
import { IssuerLogo } from "./IssuerLogo";
import { CondensedMatchPreview, buildHoldingAdvisoryIndex } from "./AlertCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
  pointsData(d: unknown[]): GlobeInstance;
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
  htmlElementsData(d: GlobeHtmlMarker[]): GlobeInstance;
  htmlLat(fn: (d: GlobeHtmlMarker) => number): GlobeInstance;
  htmlLng(fn: (d: GlobeHtmlMarker) => number): GlobeInstance;
  htmlAltitude(fn: (d: GlobeHtmlMarker) => number): GlobeInstance;
  htmlElement(fn: (d: GlobeHtmlMarker) => HTMLElement): GlobeInstance;
  htmlTransitionDuration(ms: number): GlobeInstance;
  htmlElementVisibilityModifier(
    fn: (el: HTMLElement, isVisible: boolean) => void,
  ): GlobeInstance;
  pointOfView(
    pov: { lat?: number; lng?: number; altitude?: number },
    ms?: number,
  ): GlobeInstance;
  controls(): { autoRotate: boolean; autoRotateSpeed: number };
  pauseAnimation?: () => void;
  resumeAnimation?: () => void;
  _destructor?: () => void;
};

type GlobeHtmlMarker = {
  id: string;
  kind: "holding" | "story";
  lat: number;
  lng: number;
  issuer: string;
  isin?: string | null;
  yahoo?: string | null;
  source?: string;
  articleUrl?: string | null;
  verdict?: GlobeHolding["verdict"];
  weight?: number;
  highlighted: boolean;
  dimmed: boolean;
  sizePx: number;
  label: string;
  storyTone?: string;
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

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Centre and zoom the camera on the story + holdings its arcs touch. */
function projectionCamera(
  holdings: GlobeHolding[],
  story: GlobeEvent,
  linkedIds: Set<string>,
): { lat: number; lng: number; altitude: number } {
  const pts = [{ lat: story.lat, lng: story.lng }];
  for (const h of holdings) {
    if (linkedIds.has(h.id)) pts.push({ lat: h.lat, lng: h.lng });
  }

  const lat = pts.reduce((sum, p) => sum + p.lat, 0) / pts.length;
  const lng =
    (Math.atan2(
      pts.reduce((s, p) => s + Math.sin((p.lng * Math.PI) / 180), 0),
      pts.reduce((s, p) => s + Math.cos((p.lng * Math.PI) / 180), 0),
    ) *
      180) /
    Math.PI;

  let maxSpread = 0;
  for (const p of pts) {
    const dLat = Math.abs(p.lat - lat);
    let dLng = Math.abs(p.lng - lng);
    if (dLng > 180) dLng = 360 - dLng;
    const lngScale = dLng * Math.cos((lat * Math.PI) / 180);
    maxSpread = Math.max(maxSpread, dLat, lngScale, Math.hypot(dLat, lngScale));
  }

  // Lower altitude = closer; scale with how far apart the projection spans.
  const altitude = clamp(0.58 + maxSpread * 0.07, 0.58, 1.28);

  return { lat, lng, altitude };
}

function markerRingColor(d: GlobeHtmlMarker): string {
  if (d.kind === "story") return d.storyTone ?? "#2f7ce6";
  if (d.verdict) return VERDICT_META[d.verdict]?.hex ?? VERDICT_META.OK.hex;
  return "#ffffff";
}

/** Flat logo badge for holdings / story origin — readable on the dark earth texture. */
function createGlobeMarkerEl(d: GlobeHtmlMarker): HTMLElement {
  const el = document.createElement("div");
  el.title = d.label;
  el.style.pointerEvents = "auto";
  el.style.cursor = "default";
  el.style.boxSizing = "border-box";
  el.style.flexShrink = "0";

  const ring = markerRingColor(d);
  const px = d.sizePx;
  el.style.width = `${px}px`;
  el.style.height = `${px}px`;
  el.style.borderRadius = d.kind === "story" ? "9999px" : "9px";
  el.style.background = "rgba(14, 12, 10, 0.88)";
  el.style.backdropFilter = "blur(6px)";
  el.style.boxShadow = d.highlighted
    ? `0 2px 10px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.12) inset, 0 0 14px ${ring}55`
    : "0 2px 8px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.1) inset";
  el.style.border = `${d.highlighted ? 2 : 1}px solid ${
    d.highlighted ? `${ring}cc` : "rgba(255,255,255,0.2)"
  }`;
  el.style.display = "grid";
  el.style.placeItems = "center";
  el.style.overflow = "hidden";
  el.style.opacity = d.dimmed ? "0.3" : "1";
  el.style.transition = "opacity 280ms ease, width 280ms ease, height 280ms ease";
  el.dataset.baseOpacity = d.dimmed ? "0.3" : "1";

  const logoSources = Array.from(
    new Set(
      d.kind === "story"
        ? [
            ...issuerLogoSources({
              isin: d.isin,
              issuer: d.issuer,
              yahoo: d.yahoo,
            }),
            ...publisherLogoSources(d.source ?? d.issuer, d.articleUrl),
          ]
        : issuerLogoSources({
            isin: d.isin,
            issuer: d.issuer,
            yahoo: d.yahoo,
          }),
    ),
  );
  const initials = issuerInitials(d.issuer);

  const mountInitials = () => {
    el.replaceChildren();
    const span = document.createElement("span");
    span.textContent = initials;
    span.style.font = `600 ${Math.max(9, Math.round(px * 0.28))}px system-ui, sans-serif`;
    span.style.color = "rgba(255,255,255,0.82)";
    span.style.letterSpacing = "-0.02em";
    el.appendChild(span);
  };

  const mountNewsPin = () => {
    el.replaceChildren();
    const inner = document.createElement("div");
    inner.style.width = "100%";
    inner.style.height = "100%";
    inner.style.display = "grid";
    inner.style.placeItems = "center";
    inner.style.background = d.storyTone ?? "#2f7ce6";
    inner.style.borderRadius = "9999px";
    const icon = Math.round(px * 0.42);
    inner.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${icon}" height="${icon}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>`;
    el.appendChild(inner);
  };

  if (d.kind === "story" && logoSources.length === 0) {
    mountNewsPin();
    return el;
  }

  if (logoSources.length === 0) {
    mountInitials();
    return el;
  }

  let srcIdx = 0;
  const img = document.createElement("img");
  img.alt = "";
  img.style.width = "76%";
  img.style.height = "76%";
  img.style.objectFit = "contain";
  img.style.filter = "drop-shadow(0 1px 2px rgba(0,0,0,0.35))";
  img.src = logoSources[0];
  img.onerror = () => {
    srcIdx += 1;
    if (srcIdx < logoSources.length) img.src = logoSources[srcIdx];
    else if (d.kind === "story") mountNewsPin();
    else mountInitials();
  };
  el.appendChild(img);
  return el;
}

function buildHtmlMarkers(
  data: GlobeData,
  active: GlobeEvent | null,
  linkedIds: Set<string>,
): GlobeHtmlMarker[] {
  const hasFocus = !!active;
  const holdingMarkers: GlobeHtmlMarker[] = data.holdings.map((h) => {
    const highlighted = linkedIds.has(h.id);
    return {
      id: h.id,
      kind: "holding",
      lat: h.lat,
      lng: h.lng,
      issuer: h.issuer,
      isin: h.isin,
      yahoo: h.yahoo,
      verdict: h.verdict,
      weight: h.weight,
      highlighted,
      dimmed: hasFocus && !highlighted,
      sizePx: highlighted ? 44 : Math.round(26 + h.weight * 14),
      label: `${h.issuer} · ${h.city}, ${h.country}`,
    };
  });

  if (!active) return holdingMarkers;

  const storyIssuer = active.issuer_name ?? active.source;
  const storyMarkers: GlobeHtmlMarker[] = [
    {
      id: `story:${active.id}`,
      kind: "story",
      lat: active.lat,
      lng: active.lng,
      issuer: storyIssuer,
      isin: active.issuer_isin,
      source: active.source,
      articleUrl: active.url ?? active.provenance?.url ?? null,
      highlighted: true,
      dimmed: false,
      sizePx: 38,
      label: active.summary,
      storyTone: storyHex(active),
    },
  ];

  return [...holdingMarkers, ...storyMarkers];
}

/* --------------------------------------------------------------- globe --- */

function GlobeCanvas({
  data,
  active,
  storyIndex,
  impactArcs,
  impactHoldingIds,
}: {
  data: GlobeData;
  active: GlobeEvent | null;
  storyIndex: number;
  impactArcs: GlobeArc[];
  impactHoldingIds: string[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
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
      const Globe = (await loadGlobeGl()) as unknown as () => (el: HTMLElement) => GlobeInstance;
      if (disposed || !mountRef.current) return;

      const hasStoryReel = data.events.length + (data.news?.length ?? 0) > 0;
      globe = Globe()(mountRef.current)
        .width(size.w).height(size.h)
        .globeImageUrl("/textures/earth-night.jpg")
        .bumpImageUrl("/textures/earth-topology.png")
        .backgroundImageUrl("/textures/night-sky.png")
        .showAtmosphere(true)
        .atmosphereColor("#2f7ce6")
        .atmosphereAltitude(0.18)
        .htmlElementsData(buildHtmlMarkers(data, null, new Set()))
        .htmlLat((d) => d.lat)
        .htmlLng((d) => d.lng)
        .htmlAltitude((d) =>
          d.kind === "holding" ? 0.008 + (d.weight ?? 0) * 0.016 : 0.032,
        )
        .htmlTransitionDuration(0)
        .htmlElement((d) => createGlobeMarkerEl(d))
        .htmlElementVisibilityModifier((el, isVisible) => {
          el.style.opacity = isVisible ? (el.dataset.baseOpacity ?? "1") : "0";
        })
        .pointsData([])
        .ringColor(() => (t: number) => `rgba(47,124,230,${1 - t})`)
        .ringMaxRadius(5)
        .ringPropagationSpeed(2)
        .ringRepeatPeriod(reduceMotion ? 0 : 900)
        .ringLat((d) => d.lat).ringLng((d) => d.lng)
        .ringsData([])
        .arcsData(hasStoryReel ? [] : data.arcs)
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

      const firstStory = data.events[0] ?? data.news?.[0] ?? null;
      if (firstStory) {
        const linked = new Set(
          firstStory.linked_holding_ids.filter((id) =>
            data.holdings.some((h) => h.id === id),
          ),
        );
        globe.pointOfView(
          projectionCamera(data.holdings, firstStory, linked),
          0,
        );
      } else if (data.holdings[0]) {
        const h = data.holdings[0];
        globe.pointOfView({ lat: h.lat, lng: h.lng, altitude: 1.05 }, 0);
      }
      // Keep HTML logo layer below the news overlay (css2d defaults above sibling UI).
      const css2d = mountRef.current?.querySelector(".css2d-renderer") as HTMLElement | null;
      if (css2d) {
        css2d.style.zIndex = "1";
        css2d.style.pointerEvents = "none";
      }
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

  // React to the active story: fly to it, ring it, draw its impact arcs, refresh logo badges.
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !ready) return;
    const linked = new Set(impactHoldingIds);
    activeRef.current = { id: active?.id ?? null, linked };
    g.htmlElementsData(buildHtmlMarkers(data, active, linked));
    g.arcsData(active ? impactArcs : data.arcs);
    if (active) {
      g.ringsData([{ lat: active.lat, lng: active.lng, color: storyHex(active) }]);
      g.pointOfView(
        projectionCamera(data.holdings, active, linked),
        reduceMotion ? 0 : 1200,
      );
    } else {
      g.ringsData([]);
    }
  }, [active, storyIndex, ready, impactArcs, impactHoldingIds, data, reduceMotion]);

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
    <div
      ref={wrapRef}
      className="absolute inset-0 z-0 overflow-hidden bg-[#14110b] [&_.css2d-renderer]:!z-[1] [&_.css2d-renderer]:pointer-events-none [&_.css2d-renderer_*]:pointer-events-auto"
    >
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

/* ------------------------------------------------- scrollable news reel --- */

function NewsReel({
  stories,
  index,
  onSelect,
}: {
  stories: GlobeEvent[];
  index: number;
  onSelect: (i: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectingRef = useRef(false);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || stories.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (selectingRef.current) return;
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!hit) return;
        const idx = Number((hit.target as HTMLElement).dataset.index);
        if (!Number.isNaN(idx)) onSelect(idx);
      },
      { root, threshold: [0.55, 0.7, 0.85] },
    );

    itemRefs.current.forEach((el) => {
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [stories, onSelect]);

  useEffect(() => {
    selectingRef.current = true;
    itemRefs.current[index]?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
    const t = window.setTimeout(() => {
      selectingRef.current = false;
    }, 400);
    return () => window.clearTimeout(t);
  }, [index]);

  if (stories.length === 0) return null;

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-[90] bg-gradient-to-t from-black/80 via-black/50 to-transparent px-4 pb-4 pt-8">
      <div
        ref={scrollRef}
        className="scroll-thin flex gap-2 overflow-x-auto pb-1"
        aria-label="News stories — scroll to change map projection"
      >
        {stories.map((s, i) => {
          const tone = storyHex(s);
          const active = i === index;
          return (
            <button
              key={s.id}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              data-index={i}
              onClick={() => onSelect(i)}
              className={cn(
                "min-w-[11rem] max-w-[14rem] shrink-0 rounded-lg border px-3 py-2 text-left transition-colors",
                active
                  ? "border-white/40 bg-white/15 text-white"
                  : "border-white/15 bg-black/40 text-white/75 hover:border-white/25 hover:bg-white/10",
              )}
            >
              <p className="line-clamp-2 text-[11px] font-semibold leading-snug">{s.summary}</p>
              <p className="mt-1 truncate text-[10px] text-white/55">
                {s.source} · {prettyDate(s.published_at)}
              </p>
              <span
                className="mt-1.5 inline-block h-1 w-8 rounded-full"
                style={{ background: tone }}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------- rotating story overlay --- */

function storyUrl(s: GlobeEvent): string | null {
  return s.url ?? s.provenance?.url ?? null;
}

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
  const articleUrl = storyUrl(s);
  return (
    <div
      className="pointer-events-auto absolute right-4 top-4 z-[100] w-[min(92vw,22rem)]"
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

          {articleUrl ? (
            <a
              href={articleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block text-[15px] font-semibold leading-snug text-white transition-colors hover:text-white/90 hover:underline"
            >
              {s.summary}
            </a>
          ) : (
            <p className="mt-2 text-[15px] font-semibold leading-snug">{s.summary}</p>
          )}

          {articleUrl ? (
            <a
              href={articleUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open article: ${s.summary}`}
              className="mt-2 block w-full overflow-hidden rounded-md ring-1 ring-inset ring-white/15 transition-opacity hover:opacity-90"
            >
              <LinkPreviewThumb
                url={articleUrl}
                layout="thumbnail"
                className="!h-auto !w-full !max-w-full rounded-md"
              />
            </a>
          ) : null}

          <p className="mt-2 text-[13px] leading-relaxed text-white/70">{s.headline}</p>

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

function HoldingStoryPreview({ stories }: { stories: GlobeEvent[] }) {
  if (stories.length === 0) return null;
  return (
    <div className="space-y-3">
      {stories.slice(0, 3).map((s) => {
        const url = storyUrl(s);
        const tone = storyHex(s);
        return (
          <div key={s.id} className="space-y-1.5">
            <p className="text-sm font-semibold leading-snug text-foreground">{s.summary}</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <span>{s.source}</span>
              <span>· {prettyDate(s.published_at)}</span>
              <span className="font-medium" style={{ color: tone }}>
                · {sentimentLabel(s.sentiment).text}
              </span>
            </div>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs font-medium text-primary hover:underline"
              >
                Read source article →
              </a>
            ) : null}
          </div>
        );
      })}
      {stories.length > 3 ? (
        <p className="text-[11px] text-muted-foreground">
          +{stories.length - 3} more related stor{stories.length - 3 === 1 ? "y" : "ies"}
        </p>
      ) : null}
    </div>
  );
}

function buildStoriesByHoldingId(stories: GlobeEvent[]): Map<string, GlobeEvent[]> {
  const map = new Map<string, GlobeEvent[]>();
  for (const story of stories) {
    for (const hid of story.linked_holding_ids) {
      if (!map.has(hid)) map.set(hid, []);
      const list = map.get(hid)!;
      if (!list.some((s) => s.id === story.id)) list.push(story);
    }
  }
  return map;
}

function HoldingRow({
  holding,
  clientId,
  inNews,
  advisoryMatches = [],
  relatedStories = [],
}: {
  holding: GlobeHolding;
  clientId: string;
  inNews: boolean;
  advisoryMatches?: Match[];
  relatedStories?: GlobeEvent[];
}) {
  const flagged = holding.verdict !== "OK";
  const clickable =
    inNews &&
    (advisoryMatches.length > 0 || relatedStories.length > 0 || flagged);

  const tile = (
    <div
      className={cn(
        "rounded-md border p-3 transition-shadow",
        holding.verdict === "VIOLATION"
          ? "border-negative/30 bg-negative/[0.06]"
          : holding.verdict === "WATCH"
          ? "border-warning/30 bg-warning/[0.06]"
          : "border-border bg-card",
        inNews && "ring-2 ring-inset ring-primary",
        clickable &&
          "cursor-pointer hover:border-primary/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
      )}
    >
      <div className="flex gap-3">
        <IssuerLogo
          key={holding.isin}
          issuer={holding.issuer}
          isin={holding.isin}
          yahoo={holding.yahoo}
          size="sm"
          className="mt-0.5 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-foreground">{holding.issuer}</span>
            {flagged && <VerdictChip verdict={holding.verdict} />}
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
      </div>
    </div>
  );

  if (!clickable) return tile;

  return (
    <Popover key={holding.id}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="block w-full rounded-md text-left"
          aria-label={`Advisory signal for ${holding.issuer}`}
        >
          {tile}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(92vw,28rem)] max-h-[min(70vh,32rem)] overflow-y-auto"
        align="start"
        side="top"
      >
        {advisoryMatches.length > 0 ? (
          <CondensedMatchPreview
            clientId={clientId}
            holdingIsin={holding.isin}
            matches={advisoryMatches}
          />
        ) : relatedStories.length > 0 ? (
          <HoldingStoryPreview stories={relatedStories} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Flagged on the map as{" "}
            <span className="font-medium text-foreground">
              {holding.verdict === "VIOLATION" ? "a conflict" : "watch"}
            </span>
            . Open the alerts panel for the full advisory draft.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* --------------------------------------------------------------- panel --- */

export function InvestmentGlobe({
  clientId,
  matches = [],
}: {
  clientId: string;
  matches?: Match[];
}) {
  const [data, setData] = useState<GlobeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [countryFilter, setCountryFilter] = useState("all");
  const [fetchedMatches, setFetchedMatches] = useState<Match[]>([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setData(null);
    setIndex(0);
    setCountryFilter("all");
    setFetchedMatches([]);
    (async () => {
      try {
        await api.refreshLiveNews();
      } catch {
        // best-effort — globe still loads seed/cached items
      }
      if (!alive) return;
      try {
        const g = await api.globe(clientId);
        if (alive) setData(g);
      } catch (e) {
        if (alive) setError(String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [clientId]);

  const effectiveMatches = matches.length > 0 ? matches : fetchedMatches;

  useEffect(() => {
    if (matches.length > 0) return;
    let alive = true;
    api
      .insights(clientId)
      .then((data: Insights) => alive && setFetchedMatches(data.matches))
      .catch(() => alive && setFetchedMatches([]));
    return () => {
      alive = false;
    };
  }, [clientId, matches.length]);

  // Impactful client signals first, then live world news (newest first).
  const stories = useMemo<GlobeEvent[]>(() => {
    if (!data) return [];
    const alerts = [...data.events];
    const ambient = [...(data.news ?? [])].sort((a, b) =>
      (b.published_at ?? "").localeCompare(a.published_at ?? ""),
    );
    return [...alerts, ...ambient];
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

  const countries = useMemo(
    () =>
      Array.from(new Set(holdings.map((h) => h.country).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [holdings],
  );

  const filteredHoldings = useMemo(
    () =>
      countryFilter === "all"
        ? holdings
        : holdings.filter((h) => h.country === countryFilter),
    [holdings, countryFilter],
  );

  const advisoryByIsin = useMemo(
    () => buildHoldingAdvisoryIndex(holdings, effectiveMatches, stories),
    [holdings, effectiveMatches, stories],
  );

  const storiesByHoldingId = useMemo(
    () => buildStoriesByHoldingId(stories),
    [stories],
  );

  const inNewsIsins = useMemo(() => {
    const set = new Set<string>();
    for (const h of holdings) {
      if (
        advisoryByIsin.has(h.isin) ||
        h.verdict !== "OK" ||
        (storiesByHoldingId.get(h.id)?.length ?? 0) > 0
      ) {
        set.add(h.isin);
      }
    }
    return set;
  }, [holdings, advisoryByIsin, storiesByHoldingId]);

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

        <div className="relative isolate h-[72vh] min-h-[460px] w-full">
          {data.holdings.length > 0 ? (
            <>
              <GlobeCanvas
                data={data}
                active={active}
                storyIndex={index}
                impactArcs={impactArcs}
                impactHoldingIds={impactHoldingIds}
              />
              {stories.length > 0 && (
                <>
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
                  <NewsReel stories={stories} index={index} onSelect={setIndex} />
                </>
              )}
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[#14110b] px-6 text-center text-sm text-[#9c9488]">
              No mapped holdings yet — geocoded positions appear once the portfolio loads.
            </div>
          )}
        </div>
        <p className="border-t border-border px-5 py-3 text-center text-[11px] leading-relaxed text-muted-foreground">
          Logo badges mark holdings (size tracks weight, ring shows verdict); scroll the news
          reel or let it rotate — the map flies to each story and highlights affected holdings.
        </p>
      </div>

      {/* holdings, full width below the map */}
      {data.holdings.length > 0 && (
        <div className="card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              Holdings by Location
            </p>
            {countries.length > 0 && (
              <Select value={countryFilter} onValueChange={setCountryFilter}>
                <SelectTrigger
                  className="h-8 w-[min(100%,11rem)] text-xs"
                  aria-label="Filter holdings by country"
                >
                  <SelectValue placeholder="All countries" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All countries</SelectItem>
                  {countries.map((country) => (
                    <SelectItem key={country} value={country}>
                      {country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {inNewsIsins.size > 0 ? (
            <p className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-3.5 w-3.5 rounded-sm ring-2 ring-inset ring-primary"
                  aria-hidden
                />
                In the news — click a highlighted tile for the advisory summary
              </span>
            </p>
          ) : null}
          {filteredHoldings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No holdings in {countryFilter === "all" ? "this view" : countryFilter}.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filteredHoldings.map((h) => (
                <HoldingRow
                  key={h.id}
                  clientId={clientId}
                  holding={h}
                  inNews={inNewsIsins.has(h.isin)}
                  advisoryMatches={advisoryByIsin.get(h.isin) ?? []}
                  relatedStories={storiesByHoldingId.get(h.id) ?? []}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

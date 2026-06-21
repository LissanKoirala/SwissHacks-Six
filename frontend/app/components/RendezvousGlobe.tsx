"use client";

import { useEffect, useRef, useState } from "react";
import GlobeGL from "globe.gl";
import type { ShaderMaterial } from "three";
import {
  boostTextureAnisotropy,
  createDayNightMaterial,
  loadDayNightTextures,
  updateGlobeRotation,
  updateSunPosition,
} from "@/lib/globeDayNight";
import type { RendezvousGlobeArc, RendezvousGlobeData, RendezvousGlobePoint } from "@/lib/types";

const createGlobe = GlobeGL as unknown as () => (el: HTMLElement) => GlobeInstance;

type GlobeInstance = {
  (el: HTMLElement): GlobeInstance;
  width(w: number): GlobeInstance;
  height(h: number): GlobeInstance;
  globeMaterial(m: ShaderMaterial): GlobeInstance;
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
  arcsData(d: RendezvousGlobeArc[]): GlobeInstance;
  arcStartLat(fn: (d: RendezvousGlobeArc) => number): GlobeInstance;
  arcStartLng(fn: (d: RendezvousGlobeArc) => number): GlobeInstance;
  arcEndLat(fn: (d: RendezvousGlobeArc) => number): GlobeInstance;
  arcEndLng(fn: (d: RendezvousGlobeArc) => number): GlobeInstance;
  arcColor(fn: (d: RendezvousGlobeArc) => string): GlobeInstance;
  arcLabel(fn: (d: RendezvousGlobeArc) => string): GlobeInstance;
  arcStroke(n: number): GlobeInstance;
  arcAltitude(n: number): GlobeInstance;
  arcDashLength(n: number): GlobeInstance;
  arcDashGap(n: number): GlobeInstance;
  arcDashInitialGap(fn: () => number): GlobeInstance;
  arcDashAnimateTime(ms: number): GlobeInstance;
  ringsData(d: RingDatum[]): GlobeInstance;
  ringLat(fn: (d: RingDatum) => number): GlobeInstance;
  ringLng(fn: (d: RingDatum) => number): GlobeInstance;
  ringColor(fn: (d: RingDatum) => (t: number) => string): GlobeInstance;
  ringMaxRadius(n: number): GlobeInstance;
  ringPropagationSpeed(n: number): GlobeInstance;
  ringRepeatPeriod(n: number): GlobeInstance;
  pointOfView(
    pov: { lat?: number; lng?: number; altitude?: number },
    ms?: number,
  ): GlobeInstance;
  onZoom(fn: (coords: { lat: number; lng: number }) => void): GlobeInstance;
  controls(): { autoRotate: boolean; autoRotateSpeed: number };
  renderer(): { capabilities: { getMaxAnisotropy: () => number } };
  _destructor?: () => void;
};

type GlobePoint = RendezvousGlobePoint & {
  altitude: number;
  radius: number;
  tooltip: string;
};

type GlobeViewport = { logical: number };

type RingDatum = { lat: number; lng: number };

function longitudeSpan(lngs: number[]): number {
  if (lngs.length < 2) return 0;
  const sorted = [...lngs].sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    const next = i === sorted.length - 1 ? sorted[0] + 360 : sorted[i + 1];
    maxGap = Math.max(maxGap, next - cur);
  }
  return 360 - maxGap;
}

function routePointOfView(globe: RendezvousGlobeData): {
  lat: number;
  lng: number;
  altitude: number;
} {
  if (!globe.arcs.length) {
    return { lat: globe.focus_lat, lng: globe.focus_lng, altitude: 2.0 };
  }

  const coords = globe.arcs.flatMap((arc) => [
    { lat: arc.from_lat, lng: arc.from_lng },
    { lat: arc.to_lat, lng: arc.to_lng },
  ]);
  const lats = coords.map((c) => c.lat);
  const lngs = coords.map((c) => c.lng);
  const latSpan = Math.max(...lats) - Math.min(...lats);
  const lngSpan = longitudeSpan(lngs);
  const span = Math.max(latSpan, lngSpan);
  const maxHours = globe.arcs.reduce(
    (max, arc) => Math.max(max, arc.travel_hours ?? 0),
    0,
  );

  // Keep this intentionally subtle: regional routes get a nudge, never a crop.
  const routeAltitude =
    maxHours <= 3 ? 1.35 : maxHours <= 6 ? 1.45 : maxHours <= 10 ? 1.8 : 2.0;
  const spanAltitude = span < 12 ? 1.25 : span < 25 ? 1.45 : span < 50 ? 1.85 : 2.0;
  const altitude = Math.max(1.15, Math.min(routeAltitude, spanAltitude));

  const routeCenterLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const routeCenterLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;

  return {
    lat: globe.focus_lat * 0.65 + routeCenterLat * 0.35,
    lng: globe.focus_lng * 0.65 + routeCenterLng * 0.35,
    altitude,
  };
}

function applyGlobeView(
  instance: GlobeInstance,
  globe: RendezvousGlobeData,
  material: ShaderMaterial,
  animateMs: number,
  freezeRotation: boolean,
) {
  const pov = routePointOfView(globe);
  instance.pointOfView(pov, animateMs);
  updateGlobeRotation(material, pov.lng, pov.lat);
  const controls = instance.controls();
  controls.autoRotate = !freezeRotation;
  controls.autoRotateSpeed = freezeRotation ? 0 : 0.28;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toGlobePoints(globe: RendezvousGlobeData): GlobePoint[] {
  return globe.points.map((p) => ({
    ...p,
    altitude: p.kind === "meeting" ? 0.06 : 0.02,
    radius: p.kind === "meeting" ? 0.55 : 0.35,
    tooltip: `<div style="font:12px system-ui;color:#0f172a;background:#fff;padding:6px 8px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.18)"><strong>${esc(p.label)}</strong></div>`,
  }));
}

function meetingRings(globe: RendezvousGlobeData): RingDatum[] {
  return globe.points
    .filter((p) => p.kind === "meeting")
    .map((p) => ({ lat: p.lat, lng: p.lng }));
}

function configureGlobeLayers(
  instance: GlobeInstance,
  globe: RendezvousGlobeData,
  material: ShaderMaterial,
) {
  instance
    .globeMaterial(material)
    .backgroundImageUrl("/textures/night-sky.png")
    .showAtmosphere(true)
    .atmosphereColor("#22d3ee")
    .atmosphereAltitude(0.16)
    .pointsData(toGlobePoints(globe))
    .pointLat((d: GlobePoint) => d.lat)
    .pointLng((d: GlobePoint) => d.lng)
    .pointColor((d: GlobePoint) => d.color)
    .pointAltitude((d: GlobePoint) => d.altitude)
    .pointRadius((d: GlobePoint) => d.radius)
    .pointLabel((d: GlobePoint) => d.tooltip)
    .pointsTransitionDuration(400)
    .arcsData(globe.arcs)
    .arcStartLat((d: RendezvousGlobeArc) => d.from_lat)
    .arcStartLng((d: RendezvousGlobeArc) => d.from_lng)
    .arcEndLat((d: RendezvousGlobeArc) => d.to_lat)
    .arcEndLng((d: RendezvousGlobeArc) => d.to_lng)
    .arcColor((d: RendezvousGlobeArc) => d.color)
    .arcLabel(
      (d: RendezvousGlobeArc) =>
        `<div style="font:11px system-ui;color:#0f172a;background:#fff;padding:4px 6px;border-radius:6px">${esc(d.label)}</div>`,
    )
    .arcStroke(0.7)
    .arcAltitude(0.2)
    .arcDashLength(0.35)
    .arcDashGap(0.15)
    .arcDashInitialGap(() => Math.random())
    .arcDashAnimateTime(8000)
    .ringsData(meetingRings(globe))
    .ringLat((d: RingDatum) => d.lat)
    .ringLng((d: RingDatum) => d.lng)
    .ringColor(() => (t: number) => `rgba(251,191,36,${1 - t})`)
    .ringMaxRadius(4)
    .ringPropagationSpeed(1.4)
    .ringRepeatPeriod(1400)
    .onZoom(({ lng, lat }) => updateGlobeRotation(material, lng, lat));
}

export function RendezvousGlobe({
  globe,
  freezeRotation = false,
}: {
  globe: RendezvousGlobeData;
  freezeRotation?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const materialRef = useRef<ShaderMaterial | null>(null);
  const texturesRef = useRef<import("three").Texture[]>([]);
  const [viewport, setViewport] = useState<GlobeViewport>({ logical: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const logical = Math.floor(el.clientWidth);
      if (logical <= 0) return;
      setViewport({ logical });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const tick = () => {
      if (materialRef.current) updateSunPosition(materialRef.current);
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || viewport.logical <= 0 || !globe.points.length) return;
    const mount = mountRef.current;
    if (!mount) return;

    let instance: GlobeInstance | null = null;
    let disposed = false;

    (async () => {
      const [dayTexture, nightTexture] = await loadDayNightTextures();
      if (disposed || !mountRef.current) return;

      texturesRef.current = [dayTexture, nightTexture];
      const material = createDayNightMaterial(dayTexture, nightTexture);
      materialRef.current = material;

      const Globe = createGlobe;

      if (disposed || !mountRef.current) return;

      instance = Globe()(mountRef.current)
        .width(viewport.logical)
        .height(viewport.logical);
      configureGlobeLayers(instance, globe, material);
      globeRef.current = instance;

      try {
        const maxAniso = instance.renderer().capabilities.getMaxAnisotropy();
        boostTextureAnisotropy(texturesRef.current, maxAniso);
      } catch {
        /* noop */
      }

      applyGlobeView(instance, globe, material, freezeRotation ? 800 : 0, freezeRotation);
    })();

    return () => {
      disposed = true;
      globeRef.current = null;
      materialRef.current = null;
      texturesRef.current = [];
      try {
        instance?._destructor?.();
      } catch {
        /* noop */
      }
      if (mount) mount.replaceChildren();
    };
  }, [viewport.logical]);

  useEffect(() => {
    const g = globeRef.current;
    const material = materialRef.current;
    if (!g || !material || viewport.logical <= 0) return;
    g.width(viewport.logical).height(viewport.logical);
    configureGlobeLayers(g, globe, material);
    applyGlobeView(g, globe, material, 800, freezeRotation);
  }, [globe, freezeRotation, viewport.logical]);

  if (!globe.points.length) return null;

  return (
    <div ref={wrapRef} className="w-full overflow-hidden rounded-xl bg-slate-900">
      <div
        ref={mountRef}
        className="block w-full [&>canvas]:!block [&>canvas]:!h-full [&>canvas]:!w-full"
        style={{
          width: viewport.logical > 0 ? viewport.logical : "100%",
          height: viewport.logical > 0 ? viewport.logical : undefined,
          aspectRatio: viewport.logical > 0 ? undefined : "1 / 1",
        }}
        aria-label="Globe showing meeting location and travel routes"
      />
      <p className="border-t border-slate-800 px-4 py-3 text-center text-[11px] leading-relaxed text-slate-400">
        {freezeRotation
          ? "Pinned on selected city — live day/night terminator."
          : "Live day/night — select a city to pin the view."}
      </p>
    </div>
  );
}

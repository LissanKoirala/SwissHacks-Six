"use client";

import { useEffect, useRef, useState } from "react";
import createGlobe from "cobe";
import type { Analytics, RegionExposure, RegionRisk } from "@/lib/types";
import { api } from "@/lib/api";
import { chf, pct } from "@/lib/format";
import { SentimentChip } from "./ui";
import { Provenance } from "./Provenance";

const GLOBE_SIZE = 480; // CSS px, square

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/* ------------------------------------------------------------ risk badge --- */

const RISK_META: Record<
  RegionExposure["risk_level"],
  { label: string; cls: string }
> = {
  high: {
    label: "Elevated risk",
    cls: "bg-rose-50 text-rose-700 ring-rose-200",
  },
  positive: {
    label: "Positive",
    cls: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  stable: {
    label: "Stable",
    cls: "bg-slate-100 text-slate-600 ring-slate-200",
  },
};

function RiskBadge({ level }: { level: RegionExposure["risk_level"] }) {
  const m = RISK_META[level] ?? RISK_META.stable;
  return <span className={`chip ring-1 ring-inset ${m.cls}`}>{m.label}</span>;
}

/* ----------------------------------------------------------- risk detail --- */

function RiskRow({ risk }: { risk: RegionRisk }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink">{risk.label}</span>
        {risk.issuer && (
          <span className="text-xs text-slate-500">· {risk.issuer}</span>
        )}
        <span className="ml-auto">
          <SentimentChip label={risk.sentiment} />
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        {risk.detail}
      </p>
      <div className="mt-2.5">
        <Provenance prov={risk.provenance} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- region row --- */

function RegionRow({ region }: { region: RegionExposure }) {
  const hasRisks = region.risks.length > 0;
  return (
    <div
      className={`rounded-lg border p-4 ${
        region.risk_level === "high"
          ? "border-rose-200 bg-rose-50/30"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-semibold text-ink">{region.region}</span>
        <RiskBadge level={region.risk_level} />
        <span className="ml-auto text-sm font-semibold tabular-nums text-ink">
          {chf(region.current_chf)}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
        <span className="tabular-nums">{pct(region.pct, 1)} of portfolio</span>
        <span className="tabular-nums">
          {region.count} holding{region.count === 1 ? "" : "s"}
        </span>
      </div>

      {hasRisks && (
        <div className="mt-3 space-y-2">
          {region.risks.map((r, i) => (
            <RiskRow key={`${r.label}-${i}`} risk={r} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- globe --- */

function Globe({ regions }: { regions: RegionExposure[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phiRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const markers = regions.map((r) => ({
      location: [r.lat, r.lng] as [number, number],
      size: clamp(0.04 + (r.pct / 100) * 0.12, 0.04, 0.18),
    }));

    const dpr = window.devicePixelRatio || 1;
    const width = GLOBE_SIZE * dpr;
    const height = GLOBE_SIZE * dpr;

    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width,
      height,
      phi: 0,
      theta: 0.25,
      dark: 1,
      diffuse: 1.2,
      mapSamples: 16000,
      mapBrightness: 6,
      baseColor: [0.3, 0.3, 0.35],
      markerColor: [0.12, 0.37, 0.65],
      glowColor: [0.15, 0.18, 0.25],
      markers,
      onRender: (state) => {
        phiRef.current += 0.004;
        state.phi = phiRef.current;
        // keep retina dimensions in sync across resizes
        state.width = width;
        state.height = height;
      },
    });

    return () => globe.destroy();
  }, [regions]);

  return (
    <div className="flex flex-col items-center rounded-xl bg-slate-900 p-6">
      <canvas
        ref={canvasRef}
        style={{
          width: GLOBE_SIZE,
          height: GLOBE_SIZE,
          maxWidth: "100%",
          aspectRatio: "1 / 1",
          contain: "layout paint size",
        }}
        aria-label="3D globe of portfolio exposure by region"
      />
      <p className="mt-3 text-center text-[11px] text-slate-400">
        Marker size = exposure; risk is linked to live alerts (cited).
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- panel --- */

export function InvestmentGlobe({ clientId }: { clientId: string }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .analytics(clientId)
      .then((a) => alive && setData(a))
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [clientId]);

  if (loading) {
    return (
      <section className="card p-5">
        <p className="text-sm text-slate-500">Loading geographic exposure…</p>
      </section>
    );
  }
  if (error) {
    return (
      <section className="card p-5">
        <p className="text-sm text-rose-600">
          Could not load geographic exposure: {error}
        </p>
      </section>
    );
  }
  if (!data) return null;

  const regions = [...data.by_region].sort(
    (a, b) => b.current_chf - a.current_chf
  );
  const riskRegions = regions.filter((r) => r.risks.length > 0).length;

  return (
    <section className="card flex flex-col">
      <header className="border-b border-slate-200 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">
          Geographic exposure
        </p>
        <h2 className="mt-1 text-sm font-medium leading-snug text-ink-soft">
          {regions.length} region{regions.length === 1 ? "" : "s"} ·{" "}
          {riskRegions > 0 ? (
            <span className="font-semibold text-rose-700">
              {riskRegions} with a live alert
            </span>
          ) : (
            <span className="text-emerald-700">no active alerts</span>
          )}
        </h2>
      </header>

      <div className="grid gap-5 p-5 lg:grid-cols-2">
        <div className="lg:sticky lg:top-5 lg:self-start">
          {regions.length > 0 ? (
            <Globe regions={regions} />
          ) : (
            <div className="flex h-[480px] items-center justify-center rounded-xl bg-slate-900 text-sm text-slate-400">
              No regional data.
            </div>
          )}
        </div>

        <div className="space-y-3">
          {regions.length === 0 ? (
            <p className="text-sm text-slate-500">
              No geographic exposure to show.
            </p>
          ) : (
            regions.map((r, i) => (
              <RegionRow key={`${r.region}-${i}`} region={r} />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

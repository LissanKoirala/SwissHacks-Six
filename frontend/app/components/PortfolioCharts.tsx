"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  type TooltipProps,
} from "recharts";
import type {
  Analytics,
  AllocationSlice,
  SubAssetClassRow,
  TopHolding,
} from "@/lib/types";
import { api } from "@/lib/api";
import { chf, pct, signedPp } from "@/lib/format";
import { IssuerLogo } from "./IssuerLogo";

/* ---------------------------------------------------------------- palette --- */

// Tasteful categorical palette — muted, Swiss-bank neutral with the blue accent first.
const SLICE_COLOURS = [
  "#1f5fa6", // accent
  "#3a7bc4",
  "#6aa0d6",
  "#9cc0e6",
  "#5b8a72", // muted sage
  "#c7a15a", // muted gold
  "#a86b6b", // muted clay
  "#7d8794", // slate
];

const ACCENT = "#1f5fa6";
const AMBER = "#d97706"; // amber-600
const SLATE = "#94a3b8"; // slate-400
const INK_SOFT = "#3a4049";

/* ------------------------------------------------------------- tooltips --- */

function ChartTooltip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-pop">
      {children}
    </div>
  );
}

function AllocTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload as AllocationSlice;
  return (
    <ChartTooltip>
      <p className="font-semibold text-ink">{d.name}</p>
      <p className="mt-0.5 tabular-nums text-ink-soft">{chf(d.current_chf)}</p>
      <p className="tabular-nums text-slate-500">{pct(d.pct, 1)}</p>
    </ChartTooltip>
  );
}

function DriftTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload as SubAssetClassRow;
  return (
    <ChartTooltip>
      <p className="font-semibold text-ink">{d.name.trim()}</p>
      <p className="mt-0.5 text-slate-500">{d.asset_class}</p>
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
        <span className="text-slate-500">Target</span>
        <span className="text-right text-ink-soft">{pct(d.target_pct, 1)}</span>
        <span className="text-slate-500">Current</span>
        <span className="text-right text-ink-soft">{pct(d.current_pct, 1)}</span>
        <span className="text-slate-500">Drift</span>
        <span
          className={`text-right font-medium ${
            d.breach ? "text-amber-700" : "text-ink-soft"
          }`}
        >
          {signedPp(d.drift_pp)}
        </span>
      </div>
    </ChartTooltip>
  );
}

function SectorTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload as AllocationSlice;
  return (
    <ChartTooltip>
      <p className="font-semibold text-ink">{d.name}</p>
      <p className="mt-0.5 tabular-nums text-ink-soft">{pct(d.pct, 1)}</p>
      <p className="tabular-nums text-slate-500">{chf(d.current_chf)}</p>
    </ChartTooltip>
  );
}

/* --------------------------------------------------------------- figures --- */

function FigureCard({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: string;
  tone?: "ink" | "amber" | "green" | "red";
}) {
  const toneCls =
    tone === "amber"
      ? "text-amber-700"
      : tone === "green"
      ? "text-emerald-600"
      : tone === "red"
      ? "text-rose-600"
      : "text-ink";
  return (
    <div className="card px-4 py-3.5">
      <p className={`text-2xl font-semibold tabular-nums leading-none ${toneCls}`}>
        {value}
      </p>
      <p className="mt-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ section hdr --- */

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </p>
        {subtitle && (
          <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/* ---------------------------------------------------------------- charts --- */

export function PortfolioCharts({ clientId }: { clientId: string }) {
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

  // Drop the summary/TOTAL pseudo-rows that aren't real asset sleeves
  // (mirrors PortfolioView's filtering of the mandate table).
  const driftRows = useMemo(() => {
    if (!data) return [];
    return data.by_sub_asset_class
      .filter(
        (r) =>
          r.asset_class !== "TOTAL" &&
          r.asset_class !== "Target amount" &&
          r.target_pct > 0
      )
      .map((r) => ({ ...r, name: r.name.trim() }));
  }, [data]);

  const sectorRows = useMemo(() => {
    if (!data) return [];
    return [...data.by_sector]
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 8);
  }, [data]);

  if (loading) {
    return <p className="p-5 text-sm text-slate-500">Loading analytics…</p>;
  }
  if (error) {
    return (
      <p className="p-5 text-sm text-rose-600">
        Could not load analytics: {error}
      </p>
    );
  }
  if (!data) return null;

  const f = data.figures;
  const deviationCount = (f.off_list_count ?? 0) + (f.sell_rated_count ?? 0);
  const sentimentTone: "green" | "red" =
    f.weighted_sentiment >= 0 ? "green" : "red";
  const sentimentValue = `${f.weighted_sentiment >= 0 ? "+" : ""}${f.weighted_sentiment.toFixed(
    2
  )}`;

  // Drift band: pad the domain so the ±2.0pp guide rails are always visible.
  const maxDrift = Math.max(
    2.5,
    ...driftRows.map((r) => Math.abs(r.drift_pp))
  );
  const driftDomain: [number, number] = [
    -Math.ceil(maxDrift * 2) / 2,
    Math.ceil(maxDrift * 2) / 2,
  ];

  return (
    <div className="space-y-6">
      {/* 1. Figure cards ------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <FigureCard label="Total value" value={chf(f.total_chf)} />
        <FigureCard label="Holdings" value={String(f.holding_count)} />
        <FigureCard
          label="Drift breaches"
          value={String(f.drift_breaches)}
          tone={f.drift_breaches > 0 ? "amber" : "ink"}
        />
        <FigureCard
          label="CIO deviations"
          value={String(deviationCount)}
          tone={deviationCount > 0 ? "amber" : "ink"}
        />
        <FigureCard
          label="News sentiment"
          value={sentimentValue}
          tone={sentimentTone}
        />
        <FigureCard
          label="Active alerts"
          value={String(f.alerts)}
          tone={f.alerts > 0 ? "amber" : "ink"}
        />
      </div>

      {/* 2 + 3. Allocation donut & mandate drift ------------------------- */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Allocation donut */}
        <SectionCard
          title="Asset allocation"
          subtitle={`${data.by_asset_class.length} asset classes`}
        >
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
            <div className="relative h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.by_asset_class}
                    dataKey="current_chf"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="62%"
                    outerRadius="92%"
                    paddingAngle={1.5}
                    stroke="#ffffff"
                    strokeWidth={2}
                  >
                    {data.by_asset_class.map((_, i) => (
                      <Cell
                        key={i}
                        fill={SLICE_COLOURS[i % SLICE_COLOURS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<AllocTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Centre total */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Total
                </span>
                <span className="text-sm font-semibold tabular-nums text-ink">
                  {chf(f.total_chf)}
                </span>
              </div>
            </div>

            {/* Legend with pct */}
            <ul className="space-y-1.5">
              {data.by_asset_class.map((s, i) => (
                <li
                  key={s.name}
                  className="flex items-center gap-2 text-sm"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{
                      backgroundColor: SLICE_COLOURS[i % SLICE_COLOURS.length],
                    }}
                  />
                  <span className="truncate text-ink-soft">{s.name}</span>
                  <span className="ml-auto shrink-0 tabular-nums font-medium text-ink">
                    {pct(s.pct, 1)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </SectionCard>

        {/* Mandate drift */}
        <SectionCard
          title="Mandate drift"
          subtitle="Per sub-asset class · breach threshold ±2.0pp"
        >
          <div style={{ height: Math.max(256, driftRows.length * 30) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={driftRows}
                margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                barCategoryGap="22%"
              >
                <XAxis
                  type="number"
                  domain={driftDomain}
                  tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}`}
                  tick={{ fontSize: 11, fill: INK_SOFT }}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={132}
                  tick={{ fontSize: 11, fill: INK_SOFT }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                />
                <Tooltip
                  content={<DriftTooltip />}
                  cursor={{ fill: "rgba(148,163,184,0.10)" }}
                />
                {/* ±2.0pp band guides */}
                <ReferenceLine
                  x={2}
                  stroke={AMBER}
                  strokeDasharray="4 3"
                  strokeOpacity={0.55}
                />
                <ReferenceLine
                  x={-2}
                  stroke={AMBER}
                  strokeDasharray="4 3"
                  strokeOpacity={0.55}
                />
                <ReferenceLine x={0} stroke="#cbd5e1" />
                <Bar dataKey="drift_pp" radius={[2, 2, 2, 2]} maxBarSize={18}>
                  {driftRows.map((r, i) => (
                    <Cell
                      key={i}
                      fill={r.breach ? AMBER : SLATE}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: AMBER }} />
              Breach
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: SLATE }} />
              Within band
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0 w-4 border-t border-dashed" style={{ borderColor: AMBER }} />
              ±2.0pp
            </span>
          </div>
        </SectionCard>
      </div>

      {/* 4. Sector exposure --------------------------------------------- */}
      <SectionCard
        title="Sector exposure"
        subtitle={`Top ${sectorRows.length} by weight`}
      >
        <div style={{ height: Math.max(256, sectorRows.length * 34) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={sectorRows}
              margin={{ top: 4, right: 36, bottom: 4, left: 8 }}
              barCategoryGap="24%"
            >
              <XAxis
                type="number"
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 11, fill: INK_SOFT }}
                axisLine={{ stroke: "#e2e8f0" }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={156}
                tick={{ fontSize: 11, fill: INK_SOFT }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <Tooltip
                content={<SectorTooltip />}
                cursor={{ fill: "rgba(31,95,166,0.06)" }}
              />
              <Bar
                dataKey="pct"
                fill={ACCENT}
                radius={[0, 3, 3, 0]}
                maxBarSize={20}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      {/* 5. Top holdings ------------------------------------------------- */}
      <SectionCard
        title="Top holdings"
        subtitle={`${data.top_holdings.length} largest positions`}
      >
        <TopHoldingsTable rows={data.top_holdings} />
      </SectionCard>
    </div>
  );
}

/* ------------------------------------------------------------- holdings --- */

function TopHoldingsTable({ rows }: { rows: TopHolding[] }) {
  const maxPct = Math.max(1, ...rows.map((r) => r.pct));
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-3 py-2 font-medium">Issuer</th>
            <th className="px-3 py-2 font-medium">Region</th>
            <th className="px-3 py-2 font-medium">Industry group</th>
            <th className="px-3 py-2 text-right font-medium">Value</th>
            <th className="px-3 py-2 font-medium" style={{ width: "26%" }}>
              Weight
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h, i) => (
            <tr
              key={`${h.isin}-${i}`}
              className={`border-t border-slate-100 ${
                h.in_alert
                  ? "bg-amber-50 ring-1 ring-inset ring-amber-200"
                  : "hover:bg-slate-50"
              }`}
            >
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <IssuerLogo issuer={h.issuer} isin={h.isin} size="sm" />
                  <div>
                    <span className="font-medium text-ink">{h.issuer}</span>
                    {h.in_alert && (
                      <span className="ml-2 chip bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200">
                        In alert
                      </span>
                    )}
                    <div className="font-mono text-[11px] text-slate-400">
                      {h.isin}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2 text-slate-500">{h.region ?? "—"}</td>
              <td className="px-3 py-2 text-ink-soft">
                {h.industry_group ?? "—"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-soft">
                {chf(h.current_chf)}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${
                        h.in_alert ? "bg-amber-500" : "bg-accent"
                      }`}
                      style={{ width: `${(h.pct / maxPct) * 100}%` }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-right tabular-nums text-xs text-slate-500">
                    {pct(h.pct, 1)}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

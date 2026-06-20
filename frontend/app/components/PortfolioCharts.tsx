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

// Categorical palette led by Wordsmith Blue, stepping out through the brand
// accents (teal / purple / amber) and hue-neutral greys — no evergreen, no
// indigo. All resolve against the active theme's CSS variables, so the series
// follow light/dark and stay token-true.
const SLICE_COLOURS = [
  "hsl(var(--primary))", // Wordsmith Blue
  "hsl(var(--accent-teal))", // teal accent
  "hsl(var(--accent-purple))", // purple accent
  "hsl(var(--accent-amber))", // amber accent
  "hsl(var(--primary) / 0.55)", // blue, softened
  "hsl(var(--accent-teal) / 0.55)", // teal, softened
  "hsl(var(--muted-foreground))", // neutral grey
  "hsl(var(--muted-foreground) / 0.5)", // pale grey
];

// Series chrome — semantic finance tokens (warning = breach) resolved against the
// active theme's CSS variables, so they follow light/dark and stay token-true.
const ACCENT = "hsl(var(--primary))"; // Wordsmith Blue
const WARNING = "hsl(var(--warning))"; // drift-breach signal
const NEUTRAL_BAR = "hsl(var(--muted-foreground))"; // within-band bars

// Theme-aware chrome — these resolve against the document's CSS variables at render
// time, so axis text / gridlines follow the active light or dark theme.
const AXIS_TEXT = "hsl(var(--muted-foreground))";
const AXIS_LINE = "hsl(var(--border))";

/* ------------------------------------------------------------- tooltips --- */

function ChartTooltip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-pop dark:shadow-none">
      {children}
    </div>
  );
}

function AllocTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload as AllocationSlice;
  return (
    <ChartTooltip>
      <p className="font-semibold text-foreground">{d.name}</p>
      <p className="mt-0.5 tabular-nums text-foreground/80">{chf(d.current_chf)}</p>
      <p className="tabular-nums text-muted-foreground">{pct(d.pct, 1)}</p>
    </ChartTooltip>
  );
}

function DriftTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload as SubAssetClassRow;
  return (
    <ChartTooltip>
      <p className="font-semibold text-foreground">{d.name.trim()}</p>
      <p className="mt-0.5 text-muted-foreground">{d.asset_class}</p>
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
        <span className="text-muted-foreground">Target</span>
        <span className="text-right text-foreground/80">{pct(d.target_pct, 1)}</span>
        <span className="text-muted-foreground">Current</span>
        <span className="text-right text-foreground/80">{pct(d.current_pct, 1)}</span>
        <span className="text-muted-foreground">Drift</span>
        <span
          className={`text-right font-medium ${
            d.breach ? "text-warning" : "text-foreground/80"
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
      <p className="font-semibold text-foreground">{d.name}</p>
      <p className="mt-0.5 tabular-nums text-foreground/80">{pct(d.pct, 1)}</p>
      <p className="tabular-nums text-muted-foreground">{chf(d.current_chf)}</p>
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
      ? "text-warning"
      : tone === "green"
      ? "text-positive"
      : tone === "red"
      ? "text-negative"
      : "text-foreground";
  // KPI tiles read denser and quieter than the bordered data panels: a flat
  // surface step, hairline ring, label-first stacking.
  return (
    <div className="rounded-md bg-surface-2 px-3.5 py-3 ring-1 ring-inset ring-border/70">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums leading-none ${toneCls}`}>
        {value}
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
      <div className="flex flex-wrap items-baseline gap-x-2 border-b border-border px-4 py-2.5">
        <p className="text-base font-semibold tracking-tight text-foreground">
          {title}
        </p>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
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
    return <p className="p-5 text-sm text-muted-foreground">Loading analytics…</p>;
  }
  if (error) {
    return (
      <p className="p-5 text-sm text-negative">
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
                    stroke="hsl(var(--card))"
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
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Total
                </span>
                <span className="text-sm font-semibold tabular-nums text-foreground">
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
                  <span className="truncate text-muted-foreground">{s.name}</span>
                  <span className="ml-auto shrink-0 tabular-nums font-medium text-foreground">
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
                  tick={{ fontSize: 11, fill: AXIS_TEXT }}
                  axisLine={{ stroke: AXIS_LINE }}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={132}
                  tick={{ fontSize: 11, fill: AXIS_TEXT }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                />
                <Tooltip
                  content={<DriftTooltip />}
                  cursor={{ fill: "hsl(var(--muted-foreground) / 0.10)" }}
                />
                {/* ±2.0pp band guides */}
                <ReferenceLine
                  x={2}
                  stroke={WARNING}
                  strokeDasharray="4 3"
                  strokeOpacity={0.6}
                />
                <ReferenceLine
                  x={-2}
                  stroke={WARNING}
                  strokeDasharray="4 3"
                  strokeOpacity={0.6}
                />
                <ReferenceLine x={0} stroke={AXIS_LINE} />
                <Bar dataKey="drift_pp" radius={[2, 2, 2, 2]} maxBarSize={18}>
                  {driftRows.map((r, i) => (
                    <Cell
                      key={i}
                      fill={r.breach ? WARNING : NEUTRAL_BAR}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: WARNING }} />
              Breach
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: NEUTRAL_BAR }} />
              Within band
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0 w-4 border-t border-dashed" style={{ borderColor: WARNING }} />
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
                tick={{ fontSize: 11, fill: AXIS_TEXT }}
                axisLine={{ stroke: AXIS_LINE }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={156}
                tick={{ fontSize: 11, fill: AXIS_TEXT }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <Tooltip
                content={<SectorTooltip />}
                cursor={{ fill: "hsl(var(--primary) / 0.08)" }}
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
          <tr className="border-b border-border text-left text-xs font-medium tracking-wide text-muted-foreground [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
            <th>Issuer</th>
            <th>Region</th>
            <th>Industry Group</th>
            <th className="text-right">Value</th>
            <th style={{ width: "26%" }}>Weight</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h, i) => (
            <tr
              key={`${h.isin}-${i}`}
              className={`border-t border-border/60 transition-colors ${
                h.in_alert
                  ? "bg-warning/10 ring-1 ring-inset ring-warning/20"
                  : "hover:bg-muted/50"
              }`}
            >
              <td className="px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <IssuerLogo issuer={h.issuer} isin={h.isin} size="sm" />
                  <div>
                    <span className="font-medium text-foreground">{h.issuer}</span>
                    {h.in_alert && (
                      <span className="ml-2 chip bg-warning/10 text-warning ring-1 ring-inset ring-warning/25">
                        In alert
                      </span>
                    )}
                    <div className="font-mono text-[11px] text-muted-foreground">
                      <span className="citation">{h.isin}</span>
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-3 py-1.5 text-muted-foreground">{h.region ?? "—"}</td>
              <td className="px-3 py-1.5 text-muted-foreground">
                {h.industry_group ?? "—"}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                {chf(h.current_chf)}
              </td>
              <td className="px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${
                        h.in_alert ? "bg-warning" : "bg-primary"
                      }`}
                      style={{ width: `${(h.pct / maxPct) * 100}%` }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-right tabular-nums text-xs text-muted-foreground">
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

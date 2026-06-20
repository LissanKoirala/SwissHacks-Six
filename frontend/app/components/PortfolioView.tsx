"use client";

import { useEffect, useState } from "react";
import type { Portfolio, Fundamentals, Holding } from "@/lib/types";
import { api } from "@/lib/api";
import { chf, pct, signedPp, price, compact, prettyDate } from "@/lib/format";
import { IssuerLogo } from "./IssuerLogo";
import { ProvenanceTag } from "./Provenance";

/** CIO-deviation chip: a held name off the CIO list, downgraded to SELL, or on-list. */
function CioStatusChip({ status }: { status?: string | null }) {
  if (!status || status === "CASH") return null;
  const map: Record<string, string> = {
    OFF_LIST: "bg-destructive/10 text-destructive ring-destructive/20",
    SELL: "bg-warning/10 text-warning ring-warning/25",
    HOLD: "bg-muted text-muted-foreground ring-border",
    BUY: "bg-success/10 text-success ring-success/25",
  };
  const label = status === "OFF_LIST" ? "Off CIO list" : `CIO · ${status}`;
  return (
    <span className={`chip ring-1 ring-inset ${map[status] ?? map.HOLD}`}>
      {label}
    </span>
  );
}

export function PortfolioView({
  clientId,
  affectedIsin,
}: {
  clientId: string;
  affectedIsin?: string | null;
}) {
  const [data, setData] = useState<Portfolio | null>(null);
  const [fundamentals, setFundamentals] = useState<Fundamentals[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setFundamentals([]);
    api
      .portfolio(clientId)
      .then((p) => alive && setData(p))
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    // Fundamentals are context, not a blocker — load separately and degrade silently.
    api
      .fundamentals(clientId)
      .then((f) => alive && setFundamentals(f))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [clientId]);

  if (loading) {
    return <p className="p-5 text-sm text-muted-foreground">Loading portfolio…</p>;
  }
  if (error) {
    return (
      <p className="p-5 text-sm text-negative">
        Could not load portfolio: {error}
      </p>
    );
  }
  if (!data) return null;

  // Live SIX prices are present only in USE_LIVE mode and only for listings the dataset
  // covers (mostly US lines); the column degrades to "—" otherwise.
  const hasLive = data.holdings.some((h) => h.live_price != null);
  const latestLiveTs = data.holdings
    .map((h) => h.live_ts)
    .filter(Boolean)
    .sort()
    .pop();

  // Drop the summary/TOTAL pseudo-rows that aren't real asset sleeves.
  const targets = data.mandate.targets.filter(
    (t) =>
      t.asset_class !== "TOTAL" &&
      t.asset_class !== "Target amount" &&
      t.target_pct > 0
  );

  // CIO-deviation audit (Portfolio Agent): held names off the CIO list or downgraded to SELL.
  const deviations: Holding[] = data.holdings
    .filter((h) => h.cio_status === "OFF_LIST" || h.cio_status === "SELL")
    .sort((a, b) => b.current_chf - a.current_chf);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          <span className="hl">{data.mandate.name}</span> mandate
        </h3>
        <span className="text-sm tabular-nums text-muted-foreground">
          total {chf(data.total_chf)}
        </span>
      </div>

      {/* CIO deviation audit — held names no longer on the CIO list or downgraded to SELL */}
      {deviations.length > 0 && (
        <section className="card overflow-hidden ring-1 ring-inset ring-warning/25">
          <div className="flex flex-wrap items-center gap-2 border-b border-warning/25 bg-warning/[0.06] px-4 py-3">
            <p className="text-xs font-medium tracking-wide text-warning">
              CIO deviations · <span className="tabular-nums">{deviations.length}</span>
            </p>
            <span className="text-[11px] text-muted-foreground">
              Held names off the CIO list or rated SELL — review with the client.
            </span>
          </div>
          <ul className="divide-y divide-border/60">
            {deviations.map((h) => (
              <li
                key={h.isin}
                className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm"
              >
                <IssuerLogo
                  issuer={h.issuer}
                  isin={h.isin}
                  yahoo={h.yahoo}
                  size="sm"
                />
                <span className="font-medium text-foreground">{h.issuer}</span>
                <CioStatusChip status={h.cio_status} />
                <span className="font-mono text-[11px] text-muted-foreground">
                  <span className="citation">{h.isin}</span>
                </span>
                <span className="ml-auto tabular-nums text-foreground/80">
                  {chf(h.current_chf)}
                </span>
                {h.provenance && (
                  <ProvenanceTag prov={h.provenance} label="holding" />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Mandate drift table */}
      <section className="card overflow-hidden">
        <div className="border-b border-border px-4 py-2.5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground">
            Mandate Drift · Breach Threshold ±2.0pp
          </p>
        </div>
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium tracking-wide text-muted-foreground [&>th]:px-4 [&>th]:py-2 [&>th]:font-medium">
                <th>Sub-Asset Class</th>
                <th className="text-right">Target</th>
                <th className="text-right">Current</th>
                <th className="text-right">Drift</th>
                <th className="text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((t, i) => (
                <tr
                  key={`${t.sub_asset_class}-${i}`}
                  className={`border-t border-border/60 transition-colors ${
                    t.breach ? "bg-warning/10" : "hover:bg-muted/50"
                  }`}
                >
                  <td className="px-4 py-1.5">
                    <span className="font-medium text-foreground">
                      {t.sub_asset_class.trim()}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t.asset_class}
                    </span>
                    {t.provenance && (
                      <ProvenanceTag prov={t.provenance} label="mandate" />
                    )}
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">
                    {pct(t.target_pct, 1)}
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">
                    {pct(t.current_pct, 1)}
                  </td>
                  <td
                    className={`px-4 py-1.5 text-right tabular-nums font-medium ${
                      t.breach ? "text-warning" : "text-muted-foreground"
                    }`}
                  >
                    {signedPp(t.drift_pp)}
                  </td>
                  <td className="px-4 py-1.5 text-right">
                    {t.breach ? (
                      <span className="chip bg-warning/10 text-warning ring-1 ring-inset ring-warning/25">
                        Breach
                      </span>
                    ) : (
                      <span className="chip bg-success/10 text-success ring-1 ring-inset ring-success/25">
                        Within
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Holdings table */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground">
            Holdings · <span className="tabular-nums">{data.holdings.length}</span>
          </p>
          {hasLive && (
            <span
              className="chip bg-success/10 text-success ring-1 ring-inset ring-success/25"
              title={
                latestLiveTs
                  ? `Latest SIX close ${prettyDate(latestLiveTs)}`
                  : "Live SIX prices"
              }
            >
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
              SIX live
              {latestLiveTs ? ` · ${prettyDate(latestLiveTs)}` : ""}
            </span>
          )}
        </div>
        <div className="scroll-thin max-h-[28rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-left text-xs font-medium tracking-wide text-muted-foreground [&>th]:px-4 [&>th]:py-2 [&>th]:font-medium">
                <th>Issuer</th>
                <th>Industry Group</th>
                <th>Sub-Asset Class</th>
                {hasLive && <th className="text-right">Live (SIX)</th>}
                <th className="text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {data.holdings.map((h, i) => {
                const affected =
                  affectedIsin && h.isin === affectedIsin ? true : false;
                return (
                  <tr
                    key={`${h.isin}-${i}`}
                    className={`border-t border-border/60 transition-colors ${
                      affected ? "bg-warning/10" : "hover:bg-muted/50"
                    }`}
                  >
                    <td className="px-4 py-1.5">
                      <div className="flex items-center gap-2">
                        <IssuerLogo
                          issuer={h.issuer}
                          isin={h.isin}
                          yahoo={h.yahoo}
                          size="sm"
                        />
                        <div>
                          <span className="font-medium text-foreground">{h.issuer}</span>
                          {affected && (
                            <span className="ml-2 chip bg-warning/10 text-warning ring-1 ring-inset ring-warning/25">
                              In alert
                            </span>
                          )}
                          {(h.cio_status === "OFF_LIST" ||
                            h.cio_status === "SELL") && (
                            <span className="ml-2 inline-flex">
                              <CioStatusChip status={h.cio_status} />
                            </span>
                          )}
                          <div className="font-mono text-[11px] text-muted-foreground">
                            <span className="citation">{h.isin}</span>
                            {h.six_ticker ? ` · ${h.six_ticker}` : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-1.5 text-muted-foreground">
                      {h.industry_group}
                    </td>
                    <td className="px-4 py-1.5 text-muted-foreground">
                      {h.sub_asset_class.trim()}
                    </td>
                    {hasLive && (
                      <td className="px-4 py-1.5 text-right tabular-nums">
                        {h.live_price != null ? (
                          <div className="flex flex-col items-end leading-tight">
                            <span
                              className="text-muted-foreground"
                              title={
                                h.live_ts
                                  ? `${h.price_source ?? "SIX"} · ${prettyDate(
                                      h.live_ts
                                    )}`
                                  : h.price_source ?? "SIX"
                              }
                            >
                              {price(h.live_price, h.live_ccy)}
                            </span>
                            {h.live_change_pct != null && (
                              <span
                                className={`text-[11px] tabular-nums ${
                                  h.live_change_pct >= 0
                                    ? "text-positive"
                                    : "text-negative"
                                }`}
                              >
                                {h.live_change_pct >= 0 ? "▲" : "▼"}{" "}
                                {pct(Math.abs(h.live_change_pct), 2)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-1.5 text-right tabular-nums text-foreground">
                      <span className="inline-flex items-center justify-end gap-1">
                        {chf(h.current_chf)}
                        {h.provenance && (
                          <ProvenanceTag prov={h.provenance} label="src" />
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Issuer fundamentals · dividends · insider activity (context, never an alert) */}
      {fundamentals.length > 0 && (
        <section className="card overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs font-medium tracking-wide text-muted-foreground">
              Issuer fundamentals · dividends · insider ·{" "}
              <span className="tabular-nums">{fundamentals.length}</span>
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Reference context for the conversation — not a trade signal.
            </p>
          </div>
          <div className="grid gap-px bg-border sm:grid-cols-2">
            {fundamentals.map((f) => {
              const affected = affectedIsin && f.isin === affectedIsin;
              return (
                <div
                  key={f.isin}
                  className={`bg-card p-4 ${affected ? "ring-1 ring-inset ring-warning/25" : ""}`}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <IssuerLogo issuer={f.issuer} isin={f.isin} size="sm" />
                    <span className="font-medium text-foreground">{f.issuer}</span>
                    {affected && (
                      <span className="chip bg-warning/10 text-warning ring-1 ring-inset ring-warning/25">
                        In alert
                      </span>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    <Metric label="P/E" value={f.pe_ratio != null ? f.pe_ratio.toFixed(1) : "—"} />
                    <Metric label="Dividend yield" value={pct(f.dividend_yield, 2)} />
                    <Metric label="Next ex-div" value={f.next_ex_dividend ? prettyDate(f.next_ex_dividend) : "—"} />
                    <Metric label="Market cap" value={compact(f.market_cap, f.currency)} />
                    <Metric
                      label="52-week range"
                      value={
                        f.week52_low != null && f.week52_high != null
                          ? `${price(f.week52_low, f.currency)} – ${price(f.week52_high, f.currency)}`
                          : "—"
                      }
                    />
                  </dl>
                  {f.insider_summary && (
                    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-sm text-foreground/80 ring-1 ring-inset ring-border">
                      <span className="font-medium">Insider:</span>
                      <span>{f.insider_summary}</span>
                      {f.insider_trades.map((t, i) => (
                        <ProvenanceTag
                          key={`${t.date}-${i}`}
                          prov={t.provenance}
                          label={`${t.transaction === "BUY" ? "▲" : "▼"} ${t.role ?? t.insider}`}
                        />
                      ))}
                    </div>
                  )}
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {f.as_of ? `As of ${prettyDate(f.as_of)}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular-nums text-foreground/80">{value}</dd>
    </div>
  );
}

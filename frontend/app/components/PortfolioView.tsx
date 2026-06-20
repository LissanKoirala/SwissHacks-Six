"use client";

import { useEffect, useState } from "react";
import type { Portfolio } from "@/lib/types";
import { api } from "@/lib/api";
import { chf, pct, signedPp } from "@/lib/format";

export function PortfolioView({
  clientId,
  affectedIsin,
}: {
  clientId: string;
  affectedIsin?: string | null;
}) {
  const [data, setData] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .portfolio(clientId)
      .then((p) => alive && setData(p))
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [clientId]);

  if (loading) {
    return <p className="p-5 text-sm text-slate-500">Loading portfolio…</p>;
  }
  if (error) {
    return (
      <p className="p-5 text-sm text-rose-600">
        Could not load portfolio: {error}
      </p>
    );
  }
  if (!data) return null;

  // Drop the summary/TOTAL pseudo-rows that aren't real asset sleeves.
  const targets = data.mandate.targets.filter(
    (t) =>
      t.asset_class !== "TOTAL" &&
      t.asset_class !== "Target amount" &&
      t.target_pct > 0
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-base font-semibold text-ink">
          {data.mandate.name} mandate
        </h3>
        <span className="text-sm text-slate-500">
          total {chf(data.total_chf)}
        </span>
      </div>

      {/* Mandate drift table */}
      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Mandate drift · breach threshold ±2.0pp
          </p>
        </div>
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-medium">Sub-asset class</th>
                <th className="px-4 py-2 text-right font-medium">Target</th>
                <th className="px-4 py-2 text-right font-medium">Current</th>
                <th className="px-4 py-2 text-right font-medium">Drift</th>
                <th className="px-4 py-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((t, i) => (
                <tr
                  key={`${t.sub_asset_class}-${i}`}
                  className={`border-t border-slate-100 ${
                    t.breach ? "bg-amber-50" : ""
                  }`}
                >
                  <td className="px-4 py-2">
                    <span className="font-medium text-ink">
                      {t.sub_asset_class.trim()}
                    </span>
                    <span className="ml-2 text-xs text-slate-400">
                      {t.asset_class}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-soft">
                    {pct(t.target_pct, 1)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-soft">
                    {pct(t.current_pct, 1)}
                  </td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums font-medium ${
                      t.breach ? "text-amber-700" : "text-slate-500"
                    }`}
                  >
                    {signedPp(t.drift_pp)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {t.breach ? (
                      <span className="chip bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200">
                        Breach
                      </span>
                    ) : (
                      <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">
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
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Holdings · {data.holdings.length}
          </p>
        </div>
        <div className="scroll-thin max-h-[28rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-medium">Issuer</th>
                <th className="px-4 py-2 font-medium">Industry group</th>
                <th className="px-4 py-2 font-medium">Sub-asset class</th>
                <th className="px-4 py-2 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {data.holdings.map((h, i) => {
                const affected =
                  affectedIsin && h.isin === affectedIsin ? true : false;
                return (
                  <tr
                    key={`${h.isin}-${i}`}
                    className={`border-t border-slate-100 ${
                      affected ? "bg-amber-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="px-4 py-2">
                      <span className="font-medium text-ink">{h.issuer}</span>
                      {affected && (
                        <span className="ml-2 chip bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200">
                          In alert
                        </span>
                      )}
                      <div className="font-mono text-[11px] text-slate-400">
                        {h.isin}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-ink-soft">
                      {h.industry_group}
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {h.sub_asset_class.trim()}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-soft">
                      {chf(h.current_chf)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { Opportunity } from "@/lib/types";
import { api } from "@/lib/api";
import { IssuerLogo } from "./IssuerLogo";
import { Expander } from "./ui";
import { ProvenanceList } from "./Provenance";
import { ConfirmGate } from "./ConfirmGate";

function OpportunityRow({ opp }: { opp: Opportunity }) {
  const volLabel =
    opp.hist_vol_30d != null
      ? `${(opp.hist_vol_30d * 100).toFixed(0)}% vol${
          opp.risk_source ? ` · ${opp.risk_source}` : ""
        }`
      : null;
  const sentLabel =
    opp.sentiment != null ? `sentiment ${opp.sentiment.toFixed(2)}` : null;
  const muted = [volLabel, sentLabel].filter(Boolean).join("  ·  ");

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <IssuerLogo issuer={opp.issuer} isin={opp.isin} size="sm" />
        <span className="text-sm font-semibold text-ink">{opp.issuer}</span>
        <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 font-semibold">
          BUY
        </span>
        <span className="chip bg-accent-soft text-accent ring-1 ring-inset ring-accent/30 font-semibold">
          NEW · not held
        </span>
        {opp.industry_group && (
          <span className="chip bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">
            {opp.industry_group}
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] text-slate-400">
          {opp.isin}
        </span>
      </div>

      {opp.alignment_topics.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {opp.alignment_topics.map((t) => (
            <span
              key={t}
              className="chip bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        {opp.alignment_reason}
      </p>

      {muted && (
        <p className="mt-2 text-[11px] text-slate-400">{muted}</p>
      )}

      {opp.provenance.length > 0 && (
        <div className="mt-3">
          <Expander label="View sources" count={opp.provenance.length}>
            <ProvenanceList items={opp.provenance} />
          </Expander>
        </div>
      )}
    </div>
  );
}

export function OpportunitiesPanel({ clientId }: { clientId: string }) {
  const [data, setData] = useState<Opportunity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .opportunities(clientId)
      .then((o) => alive && setData(o))
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [clientId]);

  return (
    <section className="card flex flex-col">
      <header className="border-b border-slate-200 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">
          New opportunities
        </p>
        <h2 className="mt-1 text-sm font-medium leading-snug text-ink-soft">
          Unheld CIO BUY names aligned to this client&apos;s values —
          proactive, not a swap.
        </h2>
      </header>

      <div className="flex-1 space-y-4 p-5">
        {loading ? (
          <p className="text-sm text-slate-500">Loading opportunities…</p>
        ) : error ? (
          <p className="text-sm text-rose-600">
            Could not load opportunities: {error}
          </p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-slate-500">
            No aligned opportunities right now — no unheld CIO BUY name matches
            this client&apos;s values.
          </p>
        ) : (
          <div className="space-y-3">
            {data.map((opp) => (
              <OpportunityRow key={opp.isin} opp={opp} />
            ))}
          </div>
        )}
      </div>

      {data && data.length > 0 && (
        <footer className="border-t border-slate-200 px-5 py-4">
          <ConfirmGate
            action="Add to discussion list (RM approve)"
            confirmQuestion="Surface these opportunities in the client conversation?"
            approvedLabel="✓ Approved by RM — client decides"
          />
        </footer>
      )}
    </section>
  );
}

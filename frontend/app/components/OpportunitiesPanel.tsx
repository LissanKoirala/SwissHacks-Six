"use client";

import { useEffect, useState } from "react";
import type { Opportunity } from "@/lib/types";
import { api } from "@/lib/api";
import { IssuerLogo } from "./IssuerLogo";
import { Expander, FigureCard } from "./ui";
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

  // Peek line for the collapsed detail expander: what's inside without opening it.
  const detailPeek = [
    opp.value_tags.length > 0 ? `${opp.value_tags.length} value tags` : null,
    `${opp.provenance.length} ${
      opp.provenance.length === 1 ? "source" : "sources"
    }`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="rounded-lg border border-border p-3">
      {/* glance row — issuer, logo, rating chip, score */}
      <div className="flex flex-wrap items-center gap-2">
        <IssuerLogo issuer={opp.issuer} isin={opp.isin} size="sm" />
        <span className="text-sm font-semibold text-foreground">
          {opp.issuer}
        </span>
        <span className="chip bg-success/10 text-success ring-1 ring-inset ring-success/20 font-semibold">
          BUY
        </span>
        <span className="chip bg-primary-subtle text-primary ring-1 ring-inset ring-primary/30 font-semibold">
          NEW · not held
        </span>
        {opp.industry_group && (
          <span className="chip bg-muted text-muted-foreground ring-1 ring-inset ring-border">
            {opp.industry_group}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          score
          <span className="tabular-nums text-foreground">
            {opp.score.toFixed(2)}
          </span>
        </span>
      </div>

      {/* one-line alignment reason */}
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {opp.alignment_reason}
      </p>

      {/* heavier detail (metrics, value tags, full provenance) — collapsed */}
      <div className="mt-2">
        <Expander
          label="Detail & sources"
          summary={detailPeek || undefined}
        >
          <div className="space-y-3">
            <p className="font-mono text-[11px] text-muted-foreground">
              {opp.isin}
            </p>

            {(opp.sub_asset_class || opp.region) && (
              <p className="text-[11px] text-muted-foreground">
                {[opp.sub_asset_class, opp.region].filter(Boolean).join(" · ")}
              </p>
            )}

            {(opp.hist_vol_30d != null || opp.sentiment != null) && (
              <div className="grid grid-cols-2 gap-2">
                {opp.hist_vol_30d != null && (
                  <FigureCard
                    label="30d volatility"
                    value={`${(opp.hist_vol_30d * 100).toFixed(0)}%`}
                    hint={opp.risk_source ?? undefined}
                  />
                )}
                {opp.sentiment != null && (
                  <FigureCard
                    label="Sentiment"
                    value={opp.sentiment.toFixed(2)}
                    tone={opp.sentiment >= 0 ? "green" : "red"}
                  />
                )}
              </div>
            )}

            {muted && (
              <p className="text-[11px] text-muted-foreground">{muted}</p>
            )}

            {opp.alignment_topics.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {opp.alignment_topics.map((t) => (
                  <span
                    key={t}
                    className="chip bg-success/10 text-success ring-1 ring-inset ring-success/20"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            {opp.value_tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {opp.value_tags.map((t) => (
                  <span
                    key={t}
                    className="chip bg-muted text-muted-foreground ring-1 ring-inset ring-border"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            {opp.provenance.length > 0 && (
              <ProvenanceList items={opp.provenance} />
            )}
          </div>
        </Expander>
      </div>
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

  const count = data?.length ?? 0;

  return (
    <section className="card flex flex-col">
      <header className="border-b border-border px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          New opportunities
        </p>
        <h2 className="mt-1 text-sm font-semibold leading-snug text-foreground">
          Proactive ideas
          {count > 0 && (
            <span className="font-normal text-muted-foreground">
              {" "}
              · {count} aligned to this client
            </span>
          )}
        </h2>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Unheld CIO BUY names matching this client&apos;s values — proactive,
          not a swap.
        </p>
      </header>

      <div className="flex-1 space-y-4 p-5">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading opportunities…</p>
        ) : error ? (
          <p className="text-sm text-destructive">
            Could not load opportunities: {error}
          </p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
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
        <footer className="border-t border-border px-5 py-4">
          <ConfirmGate
            action="Add to discussion list (RM approve)"
            confirmQuestion="Surface these opportunities in the client conversation?"
            approvedLabel="Approved by RM — client decides"
          />
        </footer>
      )}
    </section>
  );
}

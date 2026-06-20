"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck, AlertTriangle, ListX, Scale } from "lucide-react";
import type { PortfolioAudit, Provenance } from "@/lib/types";
import { api } from "@/lib/api";
import { chf, signedPp } from "@/lib/format";
import { ProvenanceTag } from "./Provenance";

/**
 * Proactive, news-independent standing-deviation audit (the Portfolio Agent). Shows where the book
 * stands against the client's DNA and the CIO list the moment the RM opens it — before any trigger.
 */
export function AuditPanel({ clientId }: { clientId: string }) {
  const [data, setData] = useState<PortfolioAudit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .audit(clientId)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [clientId]);

  if (loading)
    return (
      <p className="p-5 text-sm text-muted-foreground">
        Auditing the book against the client&apos;s DNA and the CIO list…
      </p>
    );
  if (error)
    return <p className="p-5 text-sm text-destructive">Could not load audit: {error}</p>;
  if (!data) return null;

  if (data.clean) {
    return (
      <div className="card flex items-center gap-3 p-5 text-sm">
        <ShieldCheck className="h-5 w-5 shrink-0 text-positive" />
        <span className="text-foreground">
          No standing deviations — every holding aligns with the client&apos;s documented values,
          sits on the CIO list, and every sleeve is inside the ±2.0pp band.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="card p-5">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 shrink-0 text-warning" />
          <h2 className="text-base font-semibold text-foreground">Standing deviations</h2>
          <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium tabular-nums text-warning ring-1 ring-inset ring-warning/20">
            {data.total_deviations}
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Surfaced proactively — independent of any news trigger. These are the things to raise at
          the next review, ranked by how directly they touch the client&apos;s documented stance.
        </p>
      </header>

      {data.value_conflicts.length > 0 && (
        <Section
          icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
          title="Values conflicts"
          subtitle="Held names whose CIO labels conflict with the client's red lines."
        >
          {data.value_conflicts.map((v) => (
            <Row
              key={v.isin}
              left={v.issuer}
              right={chf(v.current_chf)}
              tone="red"
              tags={v.conflicting_tags}
              reason={v.reason}
              provenance={v.provenance}
            />
          ))}
        </Section>
      )}

      {data.cio_deviations.length > 0 && (
        <Section
          icon={<ListX className="h-4 w-4 text-warning" />}
          title="CIO deviations"
          subtitle="Held names downgraded to SELL or no longer on the CIO list."
        >
          {data.cio_deviations.map((v) => (
            <Row
              key={v.isin}
              left={v.issuer}
              right={chf(v.current_chf)}
              tone="amber"
              tags={[v.status]}
              reason={v.reason}
              provenance={v.provenance}
            />
          ))}
        </Section>
      )}

      {data.drift_breaches.length > 0 && (
        <Section
          icon={<Scale className="h-4 w-4 text-warning" />}
          title="Mandate drift breaches"
          subtitle="Sub-asset-class sleeves outside the ±2.0pp band."
        >
          {data.drift_breaches.map((v) => (
            <Row
              key={v.sub_asset_class}
              left={v.sub_asset_class}
              right={signedPp(v.drift_pp)}
              tone="amber"
              tags={[]}
              reason={v.reason}
              provenance={v.provenance}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <div className="mb-1 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{subtitle}</p>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({
  left,
  right,
  tone,
  tags,
  reason,
  provenance,
}: {
  left: string;
  right: string;
  tone: "red" | "amber";
  tags: string[];
  reason: string;
  provenance: Provenance[];
}) {
  const toneCls = tone === "red" ? "text-negative" : "text-warning";
  return (
    <div className="rounded-md bg-surface-2 px-3.5 py-3 ring-1 ring-inset ring-border/70">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{left}</span>
        <span className={`text-sm font-semibold tabular-nums ${toneCls}`}>{right}</span>
      </div>
      {tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-border"
            >
              {t}
            </span>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        {reason}
        {provenance?.map((p, i) => (
          <ProvenanceTag key={i} prov={p} />
        ))}
      </p>
    </div>
  );
}

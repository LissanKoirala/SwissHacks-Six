"use client";

// Client Digital Twin — a pre-mortem on the current proposal. Predicts how this
// client is likely to react so the RM can prepare, with every driver citing the
// log line behind it (the explanation IS a provenance chain). Advisory only —
// it reasons about the client, it never contacts them.

import { useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  Quote,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { ClientTwin, TwinDriver, TwinStance } from "@/lib/types";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ProvenanceTag } from "./Provenance";

const STANCE_META: Record<
  TwinStance,
  { label: string; cls: string; dot: string; icon: LucideIcon }
> = {
  receptive: {
    label: "Likely receptive",
    cls: "bg-primary/10 text-primary ring-primary/20",
    dot: "bg-primary",
    icon: ArrowUpRight,
  },
  mixed: {
    label: "Mixed",
    cls: "bg-muted text-muted-foreground ring-border",
    dot: "bg-muted-foreground",
    icon: Minus,
  },
  likely_to_object: {
    label: "Likely to push back",
    cls: "bg-warning/10 text-warning ring-warning/20",
    dot: "bg-warning",
    icon: ArrowDownRight,
  },
};

// Driver stance → restrained, on-token tint (no rainbow).
const DRIVER_TINT: Record<TwinDriver["stance"], string> = {
  supportive: "text-primary",
  opposing: "text-warning",
  neutral: "text-muted-foreground",
};

function DriverRow({ d }: { d: TwinDriver }) {
  return (
    <li className="flex items-start gap-2 text-sm leading-relaxed">
      <span
        className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", {
          "bg-primary": d.stance === "supportive",
          "bg-warning": d.stance === "opposing",
          "bg-muted-foreground": d.stance === "neutral",
        })}
        aria-hidden
      />
      <span className="flex-1">
        <span className={cn("font-medium", DRIVER_TINT[d.stance])}>{d.label}</span>
        {d.weight >= 2 && (
          <span className="ml-1.5 chip bg-warning/10 text-warning ring-1 ring-inset ring-warning/20">
            high importance
          </span>
        )}
        <span className="text-foreground/80"> — {d.detail}</span>
        <ProvenanceTag prov={d.provenance} label="why" />
      </span>
    </li>
  );
}

export function TwinPanel({ clientId }: { clientId: string }) {
  const [twin, setTwin] = useState<ClientTwin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .twin(clientId)
      .then((t) => alive && setTwin(t))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [clientId]);

  const meta = twin ? STANCE_META[twin.stance] : null;
  const Icon = meta?.icon;

  return (
    <section className="card flex flex-col">
      <header className="border-b border-border px-5 py-4">
        <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground">
          <UserRound className="h-3.5 w-3.5" />
          Client Digital Twin
        </p>
        <h2 className="mt-1 text-base font-semibold leading-snug tracking-tight text-foreground">
          How the client is likely to react — before you raise it.
        </h2>
      </header>

      <div className="flex-1 space-y-5 p-5">
        {loading ? (
          <p className="text-sm text-muted-foreground">Reading the profile…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !twin ? (
          <p className="text-sm text-muted-foreground">No read available.</p>
        ) : (
          <>
            {/* stance + confidence */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("chip ring-1 ring-inset", meta!.cls)}>
                {Icon && <Icon className="h-3 w-3" aria-hidden />}
                {meta!.label}
              </span>
              <span className="chip bg-muted text-muted-foreground ring-1 ring-inset ring-border">
                {twin.confidence} confidence
              </span>
              {twin.llm_used && (
                <span className="chip bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  AI-phrased
                </span>
              )}
            </div>

            <p className="text-sm leading-relaxed text-foreground/90">{twin.summary}</p>

            {/* anticipated objection — the client's likely voice */}
            {twin.anticipated_objection && (
              <div className="rounded-md border border-warning/20 bg-warning/10 p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-warning">
                  <Quote className="h-3.5 w-3.5" />
                  They might say
                </p>
                <p className="mt-1 text-sm italic leading-relaxed text-foreground/90">
                  “{twin.anticipated_objection}”
                </p>
              </div>
            )}

            {/* suggested framing — feeds the dialogue */}
            {twin.suggested_framing && (
              <div className="rounded-md border border-primary/20 bg-primary/[0.06] p-3">
                <p className="text-xs font-medium tracking-wide text-primary">
                  Suggested framing
                </p>
                <p className="mt-1 text-sm leading-relaxed text-foreground/90">
                  {twin.suggested_framing}
                </p>
              </div>
            )}

            {/* drivers — each cited */}
            {twin.drivers.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground">
                  Why — grounded in their record
                </p>
                <ul className="space-y-2">
                  {twin.drivers.map((d, i) => (
                    <DriverRow key={`${d.kind}-${i}`} d={d} />
                  ))}
                </ul>
              </div>
            )}

            <p className="border-t border-border pt-3 text-[11px] text-muted-foreground">
              Advisory only — a prediction to help you prepare. The agent never
              contacts the client; the client always decides.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

export default TwinPanel;

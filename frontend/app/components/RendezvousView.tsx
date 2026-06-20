"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  Rendezvous,
  RendezvousInterest,
  RendezvousSuggestion,
} from "@/lib/types";
import { api } from "@/lib/api";
import { Provenance, ProvenanceList, ProvenanceTag } from "./Provenance";

/* ----------------------------------------------------------------- copy --- */

const KIND_LABEL: Record<string, string> = {
  dining: "Dining",
  sport: "Sport",
  culture: "Culture",
  outdoor: "Outdoor",
  family: "Family",
  philanthropy: "Philanthropy",
  wine: "Wine",
  travel: "Travel",
  other: "Other",
};

/* -------------------------------------------------------------- interests --- */

function InterestChip({
  interest,
  active,
  onToggle,
}: {
  interest: RendezvousInterest;
  active: boolean;
  onToggle: () => void;
}) {
  const hasProv = Boolean(interest.provenance);
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!hasProv}
      aria-expanded={active}
      className={`chip ring-1 ring-inset transition-colors ${
        active
          ? "bg-primary/10 text-primary ring-primary/30"
          : "bg-white text-ink-soft ring-slate-200 hover:bg-slate-50"
      } ${hasProv ? "cursor-pointer" : "cursor-default opacity-90"}`}
      title={hasProv ? "Show the CRM source" : "No direct citation"}
    >
      <span aria-hidden>{interest.icon}</span>
      <span>{interest.label}</span>
      {hasProv && (
        <svg
          className={`h-3 w-3 transition-transform ${active ? "rotate-90" : ""}`}
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden
        >
          <path
            d="M4 2.5 8 6l-4 3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

function InterestsStrip({
  interests,
}: {
  interests: RendezvousInterest[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = interests.find((i) => i.id === openId);

  return (
    <section className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        What we know they enjoy
      </p>
      <p className="mt-0.5 text-xs text-slate-400">
        Drawn from the meeting log — tap a chip for the citation
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {interests.map((i) => (
          <InterestChip
            key={i.id}
            interest={i}
            active={openId === i.id}
            onToggle={() => setOpenId((cur) => (cur === i.id ? null : i.id))}
          />
        ))}
      </div>
      {open?.provenance && (
        <div className="mt-3">
          <Provenance prov={open.provenance} />
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------ confidence --- */

function ConfidenceChip({
  confidence,
}: {
  confidence: RendezvousSuggestion["confidence"];
}) {
  if (confidence === "grounded") {
    return (
      <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">
        Grounded
        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path
            d="M2.5 6.5 5 9l4.5-5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  return (
    <span className="chip bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">
      Inferred
    </span>
  );
}

/* -------------------------------------------------------------- suggestion --- */

function SuggestionCard({
  suggestion,
  interestLabels,
}: {
  suggestion: RendezvousSuggestion;
  interestLabels: Map<string, RendezvousInterest>;
}) {
  const matched = suggestion.matched_interest_ids
    .map((id) => interestLabels.get(id))
    .filter((i): i is RendezvousInterest => Boolean(i));

  return (
    <article className="card flex flex-col p-4">
      {/* header */}
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xl"
          aria-hidden
        >
          {suggestion.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-snug text-ink">
              {suggestion.title}
            </h3>
            <ConfidenceChip confidence={suggestion.confidence} />
          </div>
          <p className="mt-0.5 truncate text-sm text-ink-soft">
            <span className="font-medium">{suggestion.venue}</span>
            <span className="text-slate-400"> · {suggestion.city}</span>
          </p>
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
              <path
                d="M8 5v3l2 1.5"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {suggestion.when}
            <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-500">
              {KIND_LABEL[suggestion.kind] ?? suggestion.kind}
            </span>
          </p>
        </div>
      </div>

      {/* why */}
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        {suggestion.why}
      </p>

      {/* why this fits — matched interests */}
      {matched.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Why this fits
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {matched.map((m) => (
              <span
                key={m.id}
                className="chip bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
              >
                <span aria-hidden>{m.icon}</span>
                {m.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* prep list */}
      {suggestion.prep.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Prep
          </p>
          <ul className="mt-1.5 space-y-1">
            {suggestion.prep.map((p, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-ink-soft"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* provenance */}
      {suggestion.provenance.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <ProvenanceList items={suggestion.provenance} />
        </div>
      )}
    </article>
  );
}

/* ---------------------------------------------------------- side panels --- */

function TalkingPoints({
  points,
}: {
  points: Rendezvous["talking_points"];
}) {
  return (
    <section className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Talking points
      </p>
      <ul className="mt-3 space-y-2.5">
        {points.map((p, i) => (
          <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
            <span className="text-ink-soft">
              {p.text}
              {p.provenance && <ProvenanceTag prov={p.provenance} />}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SteerAround({ avoid }: { avoid: string[] }) {
  return (
    <section className="card border-amber-200 bg-amber-50/60 p-4">
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M8 1.5 15 14H1L8 1.5Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path
            d="M8 6.5v3.5M8 11.8v.2"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        Steer around
      </p>
      <ul className="mt-3 space-y-2.5">
        {avoid.map((a, i) => (
          <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
            <span className="text-amber-900">{a}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ view --- */

export function RendezvousView({ clientId }: { clientId: string }) {
  const [data, setData] = useState<Rendezvous | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .rendezvous(clientId)
      .then((r) => alive && setData(r))
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [clientId]);

  const interestById = useMemo(() => {
    const m = new Map<string, RendezvousInterest>();
    data?.interests.forEach((i) => m.set(i.id, i));
    return m;
  }, [data]);

  const groundedCount = useMemo(
    () =>
      data?.suggestions.filter((s) => s.confidence === "grounded").length ?? 0,
    [data]
  );

  if (loading) {
    return <p className="p-5 text-sm text-slate-500">Planning the next rendezvous…</p>;
  }
  if (error) {
    return (
      <p className="p-5 text-sm text-rose-600">
        Could not load the rendezvous plan: {error}
      </p>
    );
  }
  if (!data) return null;

  const hasSuggestions = data.suggestions.length > 0;

  return (
    <div className="space-y-6">
      {/* header */}
      <header className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">
              Rendezvous planner
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-ink-soft">
              A grounded next-meeting plan for{" "}
              <span className="font-medium text-ink">{data.client_name}</span> —
              venues, conversation openers and topics to steer around, each cited
              back to the CRM history.
            </p>
          </div>
          {hasSuggestions && (
            <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">
              {groundedCount} of {data.suggestions.length} grounded
            </span>
          )}
        </div>
      </header>

      {/* interests */}
      {data.interests.length > 0 && (
        <InterestsStrip interests={data.interests} />
      )}

      {/* suggestions grid */}
      {hasSuggestions ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.suggestions.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              interestLabels={interestById}
            />
          ))}
        </div>
      ) : (
        <p className="card p-5 text-sm text-slate-500">
          No rendezvous suggestions yet — add a few personal notes to the meeting
          log and they will appear here.
        </p>
      )}

      {/* talking points + steer around */}
      {(data.talking_points.length > 0 || data.avoid.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.talking_points.length > 0 && (
            <TalkingPoints points={data.talking_points} />
          )}
          {data.avoid.length > 0 && <SteerAround avoid={data.avoid} />}
        </div>
      )}
    </div>
  );
}

// Default export too, so the component works whether imported by name or as default
// (PORT_CONTRACT §1 specifies a default export; ClientView imports it by name).
export default RendezvousView;

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  Circle,
  Clock,
  Dumbbell,
  HeartHandshake,
  Landmark,
  type LucideIcon,
  MapPin,
  Mountain,
  Plane,
  Tag,
  TriangleAlert,
  Users,
  Utensils,
  Wine,
} from "lucide-react";
import type {
  Rendezvous,
  RendezvousInterest,
  RendezvousKind,
  RendezvousSuggestion,
} from "@/lib/types";
import { api } from "@/lib/api";
import { Expander } from "./ui";
import { Provenance, ProvenanceList, ProvenanceTag } from "./Provenance";

/* ----------------------------------------------------------------- copy --- */

const KIND_LABEL: Record<RendezvousKind, string> = {
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

// Lucide icon per rendezvous kind — replaces upstream emoji. Consistent stroke,
// rendered at 16px. `other` falls back to a neutral tag glyph.
const KIND_ICON: Record<RendezvousKind, LucideIcon> = {
  dining: Utensils,
  sport: Dumbbell,
  culture: Landmark,
  outdoor: Mountain,
  family: Users,
  philanthropy: HeartHandshake,
  wine: Wine,
  travel: Plane,
  other: Tag,
};

function kindIcon(kind: RendezvousKind): LucideIcon {
  return KIND_ICON[kind] ?? Circle;
}

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
  const Icon = kindIcon(interest.category);
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!hasProv}
      aria-expanded={active}
      className={`chip ring-1 ring-inset transition-colors ${
        active
          ? "bg-primary/10 text-primary ring-primary/30"
          : "bg-card text-muted-foreground ring-border hover:bg-accent hover:text-foreground"
      } ${hasProv ? "cursor-pointer" : "cursor-default opacity-90"}`}
      title={hasProv ? "Show the CRM source" : "No direct citation"}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span>{interest.label}</span>
      {hasProv && (
        <ChevronRight
          className={`h-3 w-3 transition-transform ${active ? "rotate-90" : ""}`}
          aria-hidden
        />
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
      <p className="text-xs font-medium tracking-wide text-muted-foreground">
        Known Interests
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Drawn from the meeting log — select a chip for its citation.
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
      <span className="chip bg-primary/10 text-primary ring-1 ring-inset ring-primary/25">
        <Check className="h-3 w-3" aria-hidden />
        Grounded
      </span>
    );
  }
  return (
    <span className="chip bg-muted text-muted-foreground ring-1 ring-inset ring-border">
      Inferred
    </span>
  );
}

/* -------------------------------------------------------------- suggestion --- */

// The collapsible body shared by the top pick and the ranked list: the "why",
// the matched-interest rationale, the prep checklist and the sources — each one
// click away, summary-peeked while collapsed so the RM knows detail exists.
function SuggestionDetail({
  suggestion,
  matched,
  defaultOpen = false,
}: {
  suggestion: RendezvousSuggestion;
  matched: RendezvousInterest[];
  defaultOpen?: boolean;
}) {
  const sourceNames = suggestion.provenance
    .map((p) => p.source_id)
    .filter(Boolean);

  return (
    <div className="space-y-3">
      {/* why + why-this-fits, collapsed with a one-line peek of the rationale */}
      {(suggestion.why || matched.length > 0) && (
        <Expander
          label="Why this fits"
          summary={matched.map((m) => m.label).join(", ") || undefined}
          defaultOpen={defaultOpen}
        >
          {suggestion.why && (
            <p className="text-sm leading-relaxed text-foreground/80">
              {suggestion.why}
            </p>
          )}
          {matched.length > 0 && (
            <div className={suggestion.why ? "mt-3" : ""}>
              <div className="flex flex-wrap gap-1.5">
                {matched.map((m) => {
                  const MatchIcon = kindIcon(m.category);
                  return (
                    <span
                      key={m.id}
                      className="chip bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
                    >
                      <MatchIcon className="h-3.5 w-3.5" aria-hidden />
                      {m.label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </Expander>
      )}

      {/* prep checklist, collapsed with a count */}
      {suggestion.prep.length > 0 && (
        <Expander
          label="Prep"
          count={suggestion.prep.length}
          summary={suggestion.prep[0]}
        >
          <ul className="space-y-1">
            {suggestion.prep.map((p, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-foreground/80"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Expander>
      )}

      {/* sources, collapsed with a peek of the source ids */}
      {suggestion.provenance.length > 0 && (
        <Expander
          label="Sources"
          count={suggestion.provenance.length}
          summary={sourceNames.join(", ") || undefined}
        >
          <ProvenanceList items={suggestion.provenance} />
        </Expander>
      )}
    </div>
  );
}

// The single best-fit suggestion, elevated above the ranked list. Its glance
// shows title + venue/city + when + a confidence chip; its rationale opens by
// default (it is the recommendation), prep and sources stay one click away.
function TopSuggestionCard({
  suggestion,
  interestLabels,
}: {
  suggestion: RendezvousSuggestion;
  interestLabels: Map<string, RendezvousInterest>;
}) {
  const matched = suggestion.matched_interest_ids
    .map((id) => interestLabels.get(id))
    .filter((i): i is RendezvousInterest => Boolean(i));
  const Icon = kindIcon(suggestion.kind);

  return (
    <article className="card flex flex-col p-5 ring-1 ring-inset ring-primary/20">
      <p className="text-xs font-medium tracking-wide text-primary">Top Pick</p>
      {/* header — the glance */}
      <div className="mt-2 flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
          aria-hidden
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-semibold tracking-tight leading-snug text-foreground">
              {suggestion.title}
            </h3>
            <ConfidenceChip confidence={suggestion.confidence} />
          </div>
          <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-foreground/80">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="font-medium">{suggestion.venue}</span>
            <span className="text-muted-foreground"> · {suggestion.city}</span>
          </p>
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            <span className="tabular-nums">{suggestion.when}</span>
            <span className="ml-0.5 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {KIND_LABEL[suggestion.kind] ?? suggestion.kind}
            </span>
          </p>
        </div>
      </div>

      {/* detail — rationale open by default, prep + sources one click away */}
      <div className="mt-4 border-t border-border pt-3">
        <SuggestionDetail suggestion={suggestion} matched={matched} defaultOpen />
      </div>
    </article>
  );
}

// A compact ranked list row: the glance (rank, title, venue/city, when, kind,
// confidence) on one line; the why/prep/sources collapsed beneath it.
function SuggestionRow({
  suggestion,
  rank,
  interestLabels,
}: {
  suggestion: RendezvousSuggestion;
  rank: number;
  interestLabels: Map<string, RendezvousInterest>;
}) {
  const matched = suggestion.matched_interest_ids
    .map((id) => interestLabels.get(id))
    .filter((i): i is RendezvousInterest => Boolean(i));
  const Icon = kindIcon(suggestion.kind);

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 w-4 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">
        {rank}
      </span>
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
        aria-hidden
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        {/* glance */}
        <div className="flex items-start justify-between gap-2">
          <h4 className="truncate text-sm font-semibold tracking-tight text-foreground">
            {suggestion.title}
          </h4>
          <ConfidenceChip confidence={suggestion.confidence} />
        </div>
        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" aria-hidden />
          <span className="font-medium text-foreground/80">{suggestion.venue}</span>
          <span> · {suggestion.city}</span>
          <span className="mx-1 text-border">·</span>
          <Clock className="h-3 w-3 shrink-0" aria-hidden />
          <span className="tabular-nums">{suggestion.when}</span>
          <span className="ml-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {KIND_LABEL[suggestion.kind] ?? suggestion.kind}
          </span>
        </p>

        {/* detail — all collapsed by default */}
        <div className="mt-2.5">
          <SuggestionDetail suggestion={suggestion} matched={matched} />
        </div>
      </div>
    </li>
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
      <p className="text-xs font-medium tracking-wide text-muted-foreground">
        Talking Points
      </p>
      <ul className="mt-3 space-y-2.5">
        {points.map((p, i) => (
          <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span className="text-foreground/80">
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
    <section className="card p-4">
      <p className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground">
        <TriangleAlert className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        Steer Around
      </p>
      <ul className="mt-3 space-y-2.5">
        {avoid.map((a, i) => (
          <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
            <span className="text-foreground/80">{a}</span>
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

  // Rank the suggestions: surface the single best-fit (the first "grounded"
  // one, else the first overall) as the top pick; the rest become the list.
  const { topSuggestion, restSuggestions } = useMemo(() => {
    const all = data?.suggestions ?? [];
    if (all.length === 0) {
      return {
        topSuggestion: null as RendezvousSuggestion | null,
        restSuggestions: [] as RendezvousSuggestion[],
      };
    }
    const topIndex = Math.max(
      0,
      all.findIndex((s) => s.confidence === "grounded")
    );
    return {
      topSuggestion: all[topIndex],
      restSuggestions: all.filter((_, i) => i !== topIndex),
    };
  }, [data]);

  if (loading) {
    return <p className="p-5 text-sm text-muted-foreground">Loading the rendezvous plan…</p>;
  }
  if (error) {
    return (
      <p className="p-5 text-sm text-destructive">
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
            <p className="text-xs font-medium tracking-wide text-muted-foreground">
              Rendezvous Planner
            </p>
            <h2 className="mt-0.5 text-base font-semibold tracking-tight text-foreground">
              {data.client_name}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-foreground/80">
              A <span className="hl">next-meeting plan</span> — venues,
              conversation openers and topics to steer around, each cited back to
              the CRM history.
            </p>
          </div>
          {hasSuggestions && (
            <span className="chip bg-primary/10 text-primary ring-1 ring-inset ring-primary/25">
              <span className="tabular-nums">
                {groundedCount} of {data.suggestions.length}
              </span>{" "}
              grounded
            </span>
          )}
        </div>
      </header>

      {/* interests */}
      {data.interests.length > 0 && (
        <InterestsStrip interests={data.interests} />
      )}

      {/* suggestions — top pick elevated, the rest a compact ranked list */}
      {hasSuggestions && topSuggestion ? (
        <div className="space-y-4">
          <TopSuggestionCard
            suggestion={topSuggestion}
            interestLabels={interestById}
          />
          {restSuggestions.length > 0 && (
            <section className="card overflow-hidden p-0">
              <p className="px-4 pt-4 text-xs font-medium tracking-wide text-muted-foreground">
                More Suggestions
              </p>
              <ul className="mt-2 divide-y divide-border">
                {restSuggestions.map((s, i) => (
                  <SuggestionRow
                    key={s.id}
                    suggestion={s}
                    rank={i + 2}
                    interestLabels={interestById}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <div className="card p-6">
          <p className="text-sm font-medium text-foreground">No suggestions yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Suggestions are drawn from personal notes in the meeting log. Capture
            an interest — a sport, a cuisine, a cause — and venues will surface
            here, each cited to its source.
          </p>
        </div>
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

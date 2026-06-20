"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CandidateCity,
  CandidateFlightQuotes,
  CityActivity,
  FlightLeg,
  FlightQuote,
  MeetingOptimization,
  Rendezvous,
  RendezvousInterest,
} from "@/lib/types";
import {
  Plane,
  Train,
  Car,
  CalendarDays,
  MapPin,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/api";
import { Provenance, ProvenanceTag } from "./Provenance";
import { RendezvousGlobe } from "./RendezvousGlobe";

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

const MODE_ICON: Record<FlightLeg["mode"], typeof Plane> = {
  flight: Plane,
  train: Train,
  local: Car,
};

const CABIN_LABEL: Record<FlightQuote["cabin"], string> = {
  economy: "Economy",
  premium_economy: "Premium",
  business: "Business",
  first: "First",
};

/* ============================================================= OPTIMISER === */

function StatTile({
  label,
  value,
  hint,
  tone = "slate",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "slate" | "emerald" | "amber" | "accent";
}) {
  const tones: Record<string, string> = {
    slate: "bg-muted text-foreground",
    emerald: "bg-success/10 text-success",
    amber: "bg-warning/10 text-warning",
    accent: "bg-accent-soft text-accent-ink",
  };
  return (
    <div className={`rounded-xl px-3 py-2.5 ${tones[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-60">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold leading-none">{value}</p>
      {hint && <p className="mt-1 text-[11px] opacity-70">{hint}</p>}
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = {
  rm: "RM",
  client: "Client",
  family: "Family",
};

function FlightQuoteRow({ q }: { q: FlightQuote }) {
  const isClient = q.role === "client";
  return (
    <div
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-xs ${
        isClient ? "font-medium" : ""
      }`}
    >
      <span className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {ROLE_LABEL[q.role] ?? q.role}
      </span>
      <span className="min-w-0 flex-1 truncate text-ink">{q.participant_name}</span>
      <span className="font-mono text-[11px] text-muted-foreground">
        {q.from_iata}→{q.to_iata}
      </span>
      {q.search_url && (
        <a
          href={q.search_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] font-medium text-accent hover:underline"
          title="Search live fares on Google Flights"
        >
          Search
        </a>
      )}
      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
        {CABIN_LABEL[q.cabin]}
      </span>
      <span className="w-24 shrink-0 text-right tabular-nums text-ink">
        CHF {q.price_chf.toLocaleString()}
        {q.price_source === "google_flights" && (
          <span className="ml-1 text-[9px] font-medium uppercase tracking-wide text-success">
            live
          </span>
        )}
      </span>
      {q.note && (isClient || q.price_source === "google_flights") && (
        <p className="w-full pl-12 text-[10px] leading-relaxed text-accent-ink">{q.note}</p>
      )}
    </div>
  );
}

function FlightLegRow({ leg }: { leg: FlightLeg }) {
  const ModeIcon = MODE_ICON[leg.mode];
  return (
    <div className="flex items-center gap-2 py-1 text-xs">
      <span className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {ROLE_LABEL[leg.role] ?? leg.role}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium text-ink">
        {leg.participant_name}
      </span>
      <span className="font-mono text-[11px] text-muted-foreground">
        {leg.from_iata}
        <span className="mx-1 text-border">→</span>
        {leg.to_iata}
      </span>
      <span className="flex w-16 shrink-0 items-center justify-end gap-1 tabular-nums text-muted-foreground">
        <ModeIcon className="h-3.5 w-3.5" aria-hidden /> {leg.travel_hours}h
      </span>
      <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground">
        {Math.round(leg.co2_kg)} kg
      </span>
    </div>
  );
}

function ModeToggle({
  mode,
  defaultMode,
  onChange,
}: {
  mode: MeetingOptimization["mode"];
  defaultMode: MeetingOptimization["default_mode"];
  onChange: (m: MeetingOptimization["mode"]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
      {(["fairness", "environmental"] as const).map((m) => {
        const active = mode === m;
        const isDefault = defaultMode === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? m === "environmental"
                  ? "bg-success text-white shadow-sm"
                  : "bg-card text-ink shadow-sm"
                : "text-muted-foreground hover:text-ink"
            }`}
          >
            {m === "environmental" ? "CO₂-first" : "Fairness-first"}
            {isDefault && !active && (
              <span className="ml-1 text-[10px] opacity-60">(auto)</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function DatePicker({
  slot,
  options,
  onPick,
  onCustom,
}: {
  slot: MeetingOptimization["calendar_slot"];
  options: MeetingOptimization["calendar_options"];
  onPick: (startIso: string) => void;
  onCustom: (startIso: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  if (!slot) return null;

  return (
    <div className="relative mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-2 rounded-xl bg-accent-soft/50 px-3 py-2.5 text-left transition-colors hover:bg-accent-soft/70"
      >
        <CalendarDays
          aria-hidden
          className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{slot.label}</p>
          <p className="mt-0.5 text-[11px] text-ink-soft">{slot.rationale}</p>
          <p className="mt-1 text-[10px] text-accent-ink">Tap to change date</p>
        </div>
      </button>
      {open && (
        <div className="absolute z-20 mt-2 w-full rounded-xl border border-border bg-card p-3 shadow-pop">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Viable windows
          </p>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {(options ?? [slot]).map((o) => (
              <li key={o.start}>
                <button
                  type="button"
                  className={`w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-muted ${
                    o.start === slot.start ? "bg-accent-soft/50 font-medium" : ""
                  }`}
                  onClick={() => {
                    onPick(o.start);
                    setOpen(false);
                  }}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-border pt-3">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Custom date &amp; time
            </label>
            <div className="mt-1 flex gap-2">
              <input
                type="datetime-local"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-border px-2 py-1.5 text-xs"
              />
              <button
                type="button"
                className="shrink-0 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white"
                onClick={() => {
                  if (!custom) return;
                  const iso = new Date(custom).toISOString().slice(0, 16);
                  onCustom(iso);
                  setOpen(false);
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CandidateTable({
  candidates,
  mode,
  highlightIata,
  onSelect,
  quotesPendingFor,
}: {
  candidates: CandidateCity[];
  mode: MeetingOptimization["mode"];
  highlightIata: string;
  onSelect: (iata: string) => void;
  quotesPendingFor?: (iata: string) => boolean;
}) {
  const sortKey = mode === "environmental" ? "CO₂" : "fairness";

  const formatChf = (c: CandidateCity) => {
    if (quotesPendingFor?.(c.iata)) return "…";
    if (c.total_travel_cost_chf == null) return "—";
    return (c.total_travel_cost_chf ?? 0).toLocaleString();
  };

  const row = (c: CandidateCity) => {
    const active = c.iata === highlightIata;
    return (
      <button
        key={c.iata}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onSelect(c.iata);
        }}
        className={`w-full rounded-xl border px-3 py-2.5 text-left text-xs transition-colors ${
          active
            ? "border-accent/40 bg-accent-soft/60 ring-1 ring-inset ring-accent/25"
            : "border-border bg-card hover:bg-muted"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center font-medium text-ink">
            {c.is_optimal && (
              <MapPin className="mr-1 h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            {c.city}{" "}
            <span className="ml-1 font-mono text-[10px] text-muted-foreground">{c.iata}</span>
          </span>
          <span className="tabular-nums text-muted-foreground">
            CHF {formatChf(c)}
          </span>
        </div>
        <div className="mt-1 flex gap-3 tabular-nums text-[10px] text-muted-foreground">
          <span>{Math.round(c.total_co2_kg)} kg CO₂</span>
          <span>{c.max_travel_hours}h max</span>
          <span>σ {c.fairness_score}</span>
        </div>
      </button>
    );
  };

  return (
    <div>
      <div className="space-y-2 md:hidden">{candidates.map(row)}</div>
      <div className="hidden overflow-x-auto rounded-xl ring-1 ring-inset ring-border md:block">
        <table className="w-full min-w-[480px] text-xs">
          <thead>
            <tr className="bg-muted text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-semibold">Candidate</th>
              <th className="px-2 py-2 text-right font-semibold">CO₂</th>
              <th className="px-2 py-2 text-right font-semibold">Max</th>
              <th className="px-2 py-2 text-right font-semibold">CHF</th>
              <th className="px-3 py-2 text-right font-semibold">σ</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => {
              const active = c.iata === highlightIata;
              return (
                <tr
                  key={c.iata}
                  onClick={() => onSelect(c.iata)}
                  className={`cursor-pointer border-t border-border transition-colors hover:bg-muted ${
                    active ? "bg-accent-soft/60" : c.is_optimal ? "bg-warning/5" : ""
                  }`}
                >
                  <td className="px-3 py-2 font-medium text-ink">
                    {c.is_optimal && (
                      <MapPin className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
                    )}
                    {c.city}{" "}
                    <span className="font-mono text-[10px] text-muted-foreground">{c.iata}</span>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{Math.round(c.total_co2_kg)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.max_travel_hours}h</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatChf(c)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.fairness_score}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        Tap a city to preview · ranked by {sortKey}
      </p>
    </div>
  );
}

function OptimiserHero({
  meeting,
  selected,
  highlightIata,
  isPreview,
  onSelectCity,
  onModeChange,
  onDatePick,
  onDateCustom,
  quotesPending,
  quotesDeferred,
  quotesPendingFor,
}: {
  meeting: MeetingOptimization;
  selected: CandidateCity;
  highlightIata: string;
  isPreview: boolean;
  onSelectCity: (iata: string) => void;
  onModeChange: (m: MeetingOptimization["mode"]) => void;
  onDatePick: (startIso: string) => void;
  onDateCustom: (startIso: string) => void;
  quotesPending?: boolean;
  quotesDeferred?: boolean;
  quotesPendingFor?: (iata: string) => boolean;
}) {
  const greenest = meeting.mode === "environmental";
  const longHaul = selected.legs.filter((l) => l.mode === "flight").length;
  const globe = selected.globe ?? meeting.globe;
  const briefing = selected.city_briefing;
  const pinned = isPreview;
  const showPriceCrunch =
    quotesDeferred || (selected.flight_quotes?.length ?? 0) > 0;

  return (
    <section className="space-y-5">
      {/* Top row: globe + city overview */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="lg:sticky lg:top-5 lg:self-start">
          <RendezvousGlobe globe={globe} freezeRotation />
        </div>

        <div className="card overflow-hidden p-0">
          {briefing?.image_url && (
            <div className="relative h-44 w-full bg-muted sm:h-52">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={briefing.image_url}
                alt=""
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              <div className="absolute bottom-3 left-4 right-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-white/80">
                  {selected.is_optimal && !pinned
                    ? greenest
                      ? "Greenest place to convene"
                      : "Fairest place to convene"
                    : "Previewing candidate"}
                </p>
                <h3 className="text-xl font-semibold text-white">
                  {selected.city}
                  <span className="ml-2 font-mono text-sm font-normal text-white/70">
                    {selected.iata}
                  </span>
                </h3>
              </div>
            </div>
          )}
          <div className="p-4">
            {!briefing?.image_url && (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {selected.is_optimal && !pinned
                    ? greenest
                      ? "Greenest place to convene"
                      : "Fairest place to convene"
                    : "Previewing candidate city"}
                </p>
                <h3 className="mt-0.5 text-xl font-semibold text-ink">
                  {selected.city}
                  <span className="ml-2 font-mono text-sm font-normal text-muted-foreground">
                    {selected.iata}
                  </span>
                </h3>
              </>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {selected.country} · {meeting.participants.length} attendees
              </p>
              <ModeToggle
                mode={meeting.mode}
                defaultMode={meeting.default_mode}
                onChange={onModeChange}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatTile
                label="Travel budget"
                value={
                  quotesPending
                    ? "…"
                    : selected.total_travel_cost_chf != null
                      ? `CHF ${selected.total_travel_cost_chf.toLocaleString()}`
                      : "—"
                }
                hint={quotesPending ? "Fetching live fares…" : undefined}
                tone="amber"
              />
              <StatTile
                label="Total CO₂"
                value={`${Math.round(selected.total_co2_kg)} kg`}
                tone={greenest ? "emerald" : "slate"}
              />
              <StatTile label="Longest leg" value={`${selected.max_travel_hours}h`} />
              <StatTile label="Flights" value={`${longHaul}`} />
            </div>

            {briefing?.summary && (
              <p className="mt-3 text-xs leading-relaxed text-ink-soft line-clamp-3">
                {briefing.summary}
              </p>
            )}
            {briefing?.weather?.label && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {briefing.weather.kind === "forecast" ? "Forecast" : "Climate"}:{" "}
                {briefing.weather.label}
                {briefing.weather.precipitation_mm != null &&
                  briefing.weather.precipitation_mm > 0 &&
                  ` · ${briefing.weather.precipitation_mm} mm rain`}
              </p>
            )}

            <DatePicker
              slot={meeting.calendar_slot}
              options={meeting.calendar_options}
              onPick={onDatePick}
              onCustom={onDateCustom}
            />
          </div>
        </div>
      </div>

      {/* Below: travel details + candidate picker */}
      <div className="grid gap-3 lg:grid-cols-2">
        {showPriceCrunch && (
          <div className="card p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Travel price crunch · {selected.city}
              </p>
              <p className="text-sm font-semibold tabular-nums text-ink">
                {quotesPending ? (
                  <span className="text-muted-foreground">…</span>
                ) : selected.total_travel_cost_chf != null ? (
                  <>CHF {selected.total_travel_cost_chf.toLocaleString()}</>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </p>
            </div>
            {quotesPending ? (
              <div className="mt-4 space-y-2">
                <p className="text-xs text-muted-foreground">Fetching live fares…</p>
                <div className="h-2 animate-pulse rounded bg-muted" />
                <div className="h-2 w-4/5 animate-pulse rounded bg-muted" />
                <div className="h-2 w-3/5 animate-pulse rounded bg-muted" />
              </div>
            ) : (
              <>
                <div className="mt-2 divide-y divide-border">
                  {selected.flight_quotes?.map((q) => (
                    <FlightQuoteRow key={q.participant_id} q={q} />
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Client cabin from profile interests
                </p>
              </>
            )}
          </div>
        )}

        {selected.legs.length > 0 && (
          <div className="card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Travel legs · {selected.city}
            </p>
            <div className="mt-2 divide-y divide-border">
              {selected.legs.map((leg) => (
                <FlightLegRow key={leg.participant_id} leg={leg} />
              ))}
            </div>
          </div>
        )}
      </div>

      {meeting.candidates.length > 0 && (
        <CandidateTable
          candidates={meeting.candidates}
          mode={meeting.mode}
          highlightIata={highlightIata}
          onSelect={onSelectCity}
          quotesPendingFor={quotesPendingFor}
        />
      )}
    </section>
  );
}

/* =============================================================== VENUES === */

function ActivityCard({
  activity,
  interestLabels,
}: {
  activity: CityActivity;
  interestLabels: Map<string, RendezvousInterest>;
}) {
  const matched = activity.matched_interest_ids
    .map((id) => interestLabels.get(id))
    .filter((i): i is RendezvousInterest => Boolean(i));
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <article className="card overflow-hidden p-0">
      {activity.image_url && !imgFailed ? (
        <div className="relative h-44 w-full bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activity.image_url}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImgFailed(true)}
          />
          <span className="absolute left-3 top-3 rounded-md bg-card/90 px-2 py-0.5 text-[10px] font-medium text-ink shadow-sm">
            {KIND_LABEL[activity.kind] ?? activity.kind}
          </span>
        </div>
      ) : (
        <div className="flex h-28 items-center justify-center bg-accent-soft/40 text-3xl">
          {activity.icon}
        </div>
      )}
      <div className="flex flex-col p-4">
        <h3 className="text-sm font-semibold leading-snug text-ink">
          {activity.url ? (
            <a
              href={activity.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-accent hover:underline"
            >
              {activity.title}
            </a>
          ) : (
            activity.title
          )}
        </h3>
        <p className="mt-0.5 truncate text-xs text-ink-soft">
          {activity.url ? (
            <a
              href={activity.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium hover:text-accent hover:underline"
            >
              {activity.venue}
            </a>
          ) : (
            <span className="font-medium">{activity.venue}</span>
          )}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{activity.when}</p>
        <p className="mt-2.5 text-xs leading-relaxed text-ink-soft">{activity.why}</p>
        {matched.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {matched.map((m) => (
              <span
                key={m.id}
                className="chip bg-accent-soft text-accent-ink ring-1 ring-inset ring-accent/20"
              >
                {m.label}
              </span>
            ))}
          </div>
        )}
        {activity.prep.length > 0 && (
          <details className="group mt-2.5">
            <summary className="cursor-pointer list-none text-[11px] font-medium text-muted-foreground hover:text-ink">
              Prep checklist
            </summary>
            <ul className="mt-2 space-y-1">
              {activity.prep.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-ink-soft">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent/60" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </article>
  );
}

/* ----------------------------------------------------- context side panels --- */

function InterestsStrip({ interests }: { interests: RendezvousInterest[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = interests.find((i) => i.id === openId);
  return (
    <section className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        What we know they enjoy
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {interests.map((i) => {
          const hasProv = Boolean(i.provenance);
          const active = openId === i.id;
          return (
            <button
              key={i.id}
              type="button"
              onClick={() =>
                hasProv && setOpenId((cur) => (cur === i.id ? null : i.id))
              }
              disabled={!hasProv}
              className={`chip ring-1 ring-inset transition-colors ${
                active
                  ? "bg-accent-soft text-accent-ink ring-accent/30"
                  : "bg-card text-ink-soft ring-border hover:bg-muted"
              } ${hasProv ? "cursor-pointer" : "cursor-default opacity-90"}`}
            >
              <span aria-hidden>{i.icon}</span>
              <span>{i.label}</span>
            </button>
          );
        })}
      </div>
      {open?.provenance && (
        <div className="mt-3">
          <Provenance prov={open.provenance} />
        </div>
      )}
    </section>
  );
}

function TalkingPoints({ points }: { points: Rendezvous["talking_points"] }) {
  return (
    <section className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Conversation openers
      </p>
      <ul className="mt-3 space-y-2.5">
        {points.map((p, i) => (
          <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
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
    <section className="card border-warning/30 bg-warning/5 p-4">
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-warning">
        <AlertTriangle aria-hidden className="h-3.5 w-3.5" /> Steer around
      </p>
      <ul className="mt-3 space-y-2.5">
        {avoid.map((a, i) => (
          <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
            <span className="text-warning">{a}</span>
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
  const [pickedIata, setPickedIata] = useState<string | null>(null);
  const [modeOverride, setModeOverride] = useState<
    MeetingOptimization["mode"] | null
  >(null);
  const [eventStart, setEventStart] = useState<string | null>(null);
  const [quoteCache, setQuoteCache] = useState<
    Record<string, CandidateFlightQuotes>
  >({});
  const quoteCacheRef = useRef(quoteCache);
  quoteCacheRef.current = quoteCache;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setQuoteCache({});
    api
      .rendezvous(clientId, {
        mode: modeOverride ?? undefined,
        eventStart: eventStart ?? undefined,
      })
      .then((r) => {
        if (!alive) return;
        setData(r);
        setPickedIata((cur) => {
          const iatas = new Set(r.meeting?.candidates.map((c) => c.iata) ?? []);
          return cur && iatas.has(cur) ? cur : null;
        });
      })
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [clientId, modeOverride, eventStart]);

  const interestById = useMemo(() => {
    const m = new Map<string, RendezvousInterest>();
    data?.interests.forEach((i) => m.set(i.id, i));
    return m;
  }, [data]);

  const meeting = data?.meeting;
  const highlightIata =
    pickedIata ?? meeting?.optimal_iata ?? meeting?.candidates[0]?.iata ?? "";

  const candidatesWithQuotes = useMemo(() => {
    if (!meeting?.candidates) return [];
    return meeting.candidates.map((c) => {
      const live = quoteCache[c.iata];
      if (!live) return c;
      return {
        ...c,
        flight_quotes: live.flight_quotes,
        total_travel_cost_chf: live.total_travel_cost_chf,
      };
    });
  }, [meeting?.candidates, quoteCache]);

  const selectedCandidate = useMemo(
    () =>
      candidatesWithQuotes.find((c) => c.iata === highlightIata) ??
      candidatesWithQuotes[0],
    [candidatesWithQuotes, highlightIata],
  );

  const eventIso =
    eventStart ?? meeting?.calendar_slot?.start ?? undefined;

  useEffect(() => {
    if (!meeting?.live_flight_quotes_deferred || !highlightIata) return;
    if (quoteCacheRef.current[highlightIata]) return;

    let alive = true;
    api
      .rendezvousFlightQuotes(clientId, highlightIata, {
        eventStart: eventIso,
      })
      .then((r) => {
        if (!alive) return;
        setQuoteCache((prev) => ({ ...prev, [r.iata]: r }));
      })
      .catch(() => {
        /* tile stays in loading state until retry */
      });

    return () => {
      alive = false;
    };
  }, [clientId, highlightIata, eventIso, meeting?.live_flight_quotes_deferred]);

  if (loading) {
    return <p className="p-5 text-sm text-muted-foreground">Planning the next rendezvous…</p>;
  }
  if (error) {
    return (
      <p className="p-5 text-sm text-destructive">
        Could not load the rendezvous plan: {error}
      </p>
    );
  }
  if (!data) return null;

  const hasMeeting = Boolean(meeting?.candidates?.length);
  const activities = selectedCandidate?.activities ?? [];
  const meetingWithQuotes = meeting
    ? { ...meeting, candidates: candidatesWithQuotes }
    : undefined;
  const quotesDeferred = Boolean(meeting?.live_flight_quotes_deferred);
  const quotesPending = Boolean(
    quotesDeferred && highlightIata && !quoteCache[highlightIata],
  );
  const quotesPendingFor = (iata: string) =>
    quotesDeferred && !quoteCache[iata];

  return (
    <div className="space-y-6">
      {hasMeeting && meetingWithQuotes && selectedCandidate && meeting && (
        <OptimiserHero
          meeting={meetingWithQuotes}
          selected={selectedCandidate}
          highlightIata={highlightIata}
          isPreview={
            pickedIata !== null && pickedIata !== meeting.optimal_iata
          }
          onSelectCity={setPickedIata}
          onModeChange={(m) => {
            setModeOverride(m);
            setPickedIata(null);
          }}
          onDatePick={setEventStart}
          onDateCustom={setEventStart}
          quotesPending={quotesPending}
          quotesDeferred={quotesDeferred}
          quotesPendingFor={quotesPendingFor}
        />
      )}

      {activities.length > 0 && selectedCandidate && (
        <section>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What to do once you&apos;re together
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            In {selectedCandidate.city} — matched to this client&apos;s cited interests
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activities.map((a) => (
              <ActivityCard
                key={a.id}
                activity={a}
                interestLabels={interestById}
              />
            ))}
          </div>
        </section>
      )}

      {/* context row */}
      {(data.interests.length > 0 ||
        data.talking_points.length > 0 ||
        data.avoid.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-3">
          {data.interests.length > 0 && (
            <InterestsStrip interests={data.interests} />
          )}
          {data.talking_points.length > 0 && (
            <TalkingPoints points={data.talking_points} />
          )}
          {data.avoid.length > 0 && <SteerAround avoid={data.avoid} />}
        </div>
      )}

      <footer className="border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        <p>
          Where to convene{" "}
          <span className="font-medium text-foreground">{data.client_name}</span> and
          their party — pick a candidate city to preview venues, weather and travel
          quotes.
        </p>
        {meeting?.summary && (
          <p className="mt-2">{meeting.summary}</p>
        )}
      </footer>
    </div>
  );
}

export default RendezvousView;

"use client";

// The RM's morning landing page (docs/OVERVIEW_CONTRACT.md). One glanceable desk view
// across all clients — priority tasks, upcoming meetings, market moves, portfolio events
// and the news wire — every card grounded in a real source. Detail lives one click away:
// any client name drills into ClientView. This view decides nothing; it orients the RM.

import { useEffect, useState, type ReactNode } from "react";
import type {
  Overview,
  OverviewTask,
  OverviewMeeting,
  MarketMove,
  PortfolioEvent,
  NewsWireItem,
  Severity,
  Polarity,
} from "@/lib/types";
import { api } from "@/lib/api";
import { chf, prettyDate, titleCase } from "@/lib/format";
import { ClientAvatar } from "./ClientAvatar";
import { MandatePill, PolarityChip } from "./ui";
import { ProvenanceTag } from "./Provenance";

/* ---------------------------------------------------------------- tokens --- */

const SEVERITY: Record<
  Severity,
  { rail: string; chip: string; label: string }
> = {
  high: {
    rail: "bg-rose-500",
    chip: "bg-rose-50 text-rose-700 ring-rose-200",
    label: "Urgent",
  },
  med: {
    rail: "bg-amber-400",
    chip: "bg-amber-50 text-amber-700 ring-amber-200",
    label: "Follow up",
  },
  low: {
    rail: "bg-slate-300",
    chip: "bg-slate-100 text-slate-600 ring-slate-200",
    label: "Watch",
  },
};

const EVENT_KIND: Record<
  PortfolioEvent["kind"],
  { icon: string; label: string; cls: string }
> = {
  earnings: { icon: "📊", label: "Earnings", cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  filing: { icon: "📄", label: "Filing", cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  ipo: { icon: "🚀", label: "IPO watch", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function firstName(name: string): string {
  return name.split(" ")[0] || name;
}

function compactChf(value: number): string {
  if (value >= 1e6) return `CHF ${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `CHF ${(value / 1e3).toFixed(0)}k`;
  return chf(value);
}

/* ------------------------------------------------------------ small bits --- */

function DirectionMark({ direction }: { direction: MarketMove["direction"] }) {
  const map = {
    up: { glyph: "▲", cls: "text-emerald-600" },
    down: { glyph: "▼", cls: "text-rose-600" },
    flat: { glyph: "▬", cls: "text-slate-400" },
  } as const;
  const m = map[direction];
  return <span className={`text-xs ${m.cls}`} aria-hidden>{m.glyph}</span>;
}

function SoonButton({ label, title }: { label: string; title: string }) {
  return (
    <button
      type="button"
      disabled
      title={`${title} — coming with the live integration`}
      className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-dashed border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-400"
    >
      {label}
      <span className="rounded bg-slate-100 px-1 text-[9px] uppercase tracking-wide text-slate-400">
        soon
      </span>
    </button>
  );
}

function SectionHeader({
  title,
  count,
  hint,
  action,
}: {
  title: string;
  count?: number;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h2>
      {typeof count === "number" && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-600">
          {count}
        </span>
      )}
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ kpis --- */

function KpiStrip({ o }: { o: Overview }) {
  const k = o.kpis;
  const cells: { label: string; value: string; tone?: string }[] = [
    { label: "Clients", value: String(k.clients) },
    {
      label: "Priority tasks",
      value: String(k.priority_tasks),
      tone: k.priority_tasks ? "text-rose-600" : "text-ink",
    },
    { label: "Meetings", value: String(k.meetings_upcoming) },
    { label: "Market moves", value: String(k.market_moves) },
    { label: "Portfolio events", value: String(k.portfolio_events) },
    { label: "Assets under advice", value: compactChf(k.aum_chf) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cells.map((c) => (
        <div key={c.label} className="card px-4 py-3">
          <p className={`text-2xl font-semibold ${c.tone ?? "text-ink"}`}>
            {c.value}
          </p>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
            {c.label}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------- priority §1 --- */

function TaskCard({
  task,
  onOpen,
}: {
  task: OverviewTask;
  onOpen: (id: string) => void;
}) {
  const sev = SEVERITY[task.severity];
  return (
    <div className="card relative overflow-hidden p-4 pl-5">
      <span className={`absolute inset-y-0 left-0 w-1.5 ${sev.rail}`} aria-hidden />
      <div className="flex items-start gap-3">
        <ClientAvatar clientId={task.client_id} name={task.client_name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onOpen(task.client_id)}
              className="text-sm font-semibold text-ink hover:text-accent-ink hover:underline"
            >
              {task.client_name}
            </button>
            <MandatePill mandate={task.mandate} />
            <span className={`chip ring-1 ring-inset ${sev.chip}`}>{sev.label}</span>
            <PolarityChip polarity={task.polarity} />
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{task.reason}</p>

          <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-inset ring-slate-100">
            <p>
              <span className="font-semibold text-slate-500">Trigger · {task.trigger_source}</span>{" "}
              — {task.trigger_headline}
              <ProvenanceTag prov={task.provenance[0]} label="why" />
            </p>
            <p className="mt-1.5 flex items-start gap-1.5">
              <span aria-hidden>→</span>
              <span className="font-medium text-ink-soft">{task.suggested_action}</span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpen(task.client_id)}
          className="btn btn-primary shrink-0 self-center text-xs"
        >
          Open {firstName(task.client_name)} →
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ meetings §2 --- */

function MeetingRow({
  m,
  onOpen,
}: {
  m: OverviewMeeting;
  onOpen: (id: string) => void;
}) {
  const [d, mon] = m.day_label.split(" ").length === 3
    ? [m.day_label.split(" ")[1], m.day_label.split(" ")[2]]
    : ["", ""];
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
      <div className="grid w-12 shrink-0 place-items-center rounded-lg bg-accent-soft py-1.5 text-center">
        <span className="text-base font-bold leading-none text-accent-ink">{d}</span>
        <span className="text-[10px] uppercase text-accent-ink/70">{mon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpen(m.client_id)}
            className="text-sm font-semibold text-ink hover:text-accent-ink hover:underline"
          >
            {m.client_name}
          </button>
          <span className="text-xs text-slate-400">
            {m.time} · {m.channel}
          </span>
          {m.has_alert && (
            <span className="chip bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200">
              has a task
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-ink-soft">
          <span className="font-medium">{m.agenda}</span>
          {m.venue ? ` · ${m.venue}` : ""}
        </p>
        {m.last_met && (
          <p className="mt-0.5 text-[11px] text-slate-400">
            Last met {prettyDate(m.last_met)}
            {m.last_modality ? ` (${m.last_modality})` : ""}
            {m.provenance[0] && <ProvenanceTag prov={m.provenance[0]} label="log" />}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <SoonButton label="Draft pre-meeting email" title="AI email drafting" />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------- market moves §3 --- */

function MarketMoveRow({ mv }: { mv: MarketMove }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center gap-2">
        <DirectionMark direction={mv.direction} />
        <p className="flex-1 text-sm font-medium text-ink">{mv.headline}</p>
        <span className="text-[11px] text-slate-400">{prettyDate(mv.published_at)}</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{mv.summary}</p>
      <p className="mt-1.5 text-[11px] text-slate-400">
        {mv.source}
        <ProvenanceTag prov={mv.provenance} label="source" />
      </p>
    </div>
  );
}

/* ----------------------------------------------------- portfolio events §4 --- */

function PortfolioEventRow({
  e,
  onOpen,
}: {
  e: PortfolioEvent;
  onOpen: (id: string) => void;
}) {
  const kind = EVENT_KIND[e.kind];
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center gap-2">
        <span className={`chip ring-1 ring-inset ${kind.cls}`}>
          <span aria-hidden>{kind.icon}</span> {kind.label}
        </span>
        <p className="flex-1 text-sm font-medium text-ink">{e.title}</p>
        <span className="text-[11px] text-slate-400">{e.day_label}</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{e.detail}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-slate-400">Held by</span>
        {e.held_by.map((h) => (
          <button
            key={h.client_id}
            type="button"
            onClick={() => onOpen(h.client_id)}
            title={`Open ${h.client_name}`}
            className="flex items-center gap-1 rounded-full bg-slate-50 py-0.5 pl-0.5 pr-2 ring-1 ring-inset ring-slate-200 hover:bg-slate-100"
          >
            <ClientAvatar clientId={h.client_id} name={h.client_name} size="sm" className="!h-5 !w-5 !ring-0" />
            <span className="text-[11px] text-slate-600">{firstName(h.client_name)}</span>
          </button>
        ))}
        <span className="ml-auto text-[11px] font-medium text-slate-500">
          {chf(e.exposure_chf)}
          <ProvenanceTag prov={e.provenance} label="holding" />
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ news wire §5 --- */

function ClientPolarityChip({
  ref_,
  onOpen,
}: {
  ref_: NewsWireItem["relevant_clients"][number];
  onOpen: (id: string) => void;
}) {
  const dot: Record<Polarity, string> = {
    conflict: "bg-amber-500",
    opportunity: "bg-emerald-500",
    neutral: "bg-slate-400",
  };
  return (
    <button
      type="button"
      onClick={() => onOpen(ref_.client_id)}
      title={`${ref_.polarity} · open ${ref_.client_name}`}
      className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot[ref_.polarity]}`} />
      {firstName(ref_.client_name)}
    </button>
  );
}

function NewsRow({
  n,
  onOpen,
}: {
  n: NewsWireItem;
  onOpen: (id: string) => void;
}) {
  const up = n.sentiment_score > 0.05;
  const down = n.sentiment_score < -0.05;
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-slate-400">{n.source}</span>
        <span className="ml-auto text-[11px] text-slate-400">{prettyDate(n.published_at)}</span>
      </div>
      <p className="mt-0.5 text-sm font-medium text-ink">{n.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={`chip ring-1 ring-inset ${
            up
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
              : down
              ? "bg-rose-50 text-rose-700 ring-rose-200"
              : "bg-slate-50 text-slate-600 ring-slate-200"
          }`}
        >
          {n.sentiment_label} {n.sentiment_score >= 0 ? "+" : ""}
          {n.sentiment_score.toFixed(2)}
        </span>
        {n.topics.map((t) => (
          <span key={t} className="chip bg-slate-50 text-slate-500 ring-1 ring-inset ring-slate-200">
            {titleCase(t)}
          </span>
        ))}
        <ProvenanceTag prov={n.provenance} label="source" />
      </div>
      {n.relevant_clients.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-400">Affects</span>
          {n.relevant_clients.map((r) => (
            <ClientPolarityChip key={r.client_id} ref_={r} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- the page --- */

export function OverviewDashboard({
  onOpenClient,
}: {
  onOpenClient: (id: string) => void;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .overview()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid h-full place-items-center text-sm text-slate-500">
        Loading the desk…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="grid h-full place-items-center px-8 text-center">
        <div>
          <p className="text-sm font-medium text-rose-600">Could not load the overview.</p>
          <p className="mt-1 text-xs text-slate-500">{error}</p>
          <p className="mt-2 text-xs text-slate-400">Is the API running on http://localhost:8000?</p>
        </div>
      </div>
    );
  }

  const o = data;

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-8 py-6">
        {/* greeting + briefing */}
        <header className="mb-5">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="text-2xl font-semibold text-ink">
              {greeting()}, {firstName(o.rm_name)}
            </h1>
            <span className="text-sm text-slate-400">
              {prettyDate(o.today)} ·{" "}
              {o.use_live ? "live data" : "seed data"}
            </span>
          </div>
          <div className="mt-2 flex items-start gap-2 rounded-lg bg-accent-soft px-4 py-2.5 text-sm text-accent-ink ring-1 ring-inset ring-accent/20">
            <span className="shrink-0 rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
              Briefing
            </span>
            <span className="leading-relaxed">{o.briefing}</span>
            <span className="ml-auto hidden shrink-0 sm:block">
              <SoonButton label="Send as SMS" title="Twilio morning briefing" />
            </span>
          </div>
        </header>

        <KpiStrip o={o} />

        {/* §1 priority tasks */}
        <section className="mt-7">
          <SectionHeader
            title="Priority — touch base"
            count={o.priority_tasks.length}
            hint="a world event hit their profile"
          />
          {o.priority_tasks.length === 0 ? (
            <div className="card p-5 text-sm text-slate-500">
              Nothing flagged across the book this morning.
            </div>
          ) : (
            <div className="space-y-3">
              {o.priority_tasks.map((t) => (
                <TaskCard key={t.id} task={t} onOpen={onOpenClient} />
              ))}
            </div>
          )}
        </section>

        {/* §2 meetings + §3 market moves */}
        <div className="mt-7 grid gap-6 lg:grid-cols-2">
          <section>
            <SectionHeader
              title="Meetings coming up"
              count={o.meetings.length}
              action={<SoonButton label="Connect Google Calendar" title="Calendar sync" />}
            />
            <div className="card space-y-2.5 p-4">
              {o.meetings.map((m) => (
                <MeetingRow key={m.id} m={m} onOpen={onOpenClient} />
              ))}
            </div>
          </section>

          <section>
            <SectionHeader
              title="Big market moves"
              count={o.market_moves.length}
              hint="macro · dialogue only"
            />
            <div className="card space-y-2.5 p-4">
              {o.market_moves.length === 0 ? (
                <p className="text-sm text-slate-500">No notable macro moves.</p>
              ) : (
                o.market_moves.map((mv) => <MarketMoveRow key={mv.id} mv={mv} />)
              )}
            </div>
          </section>
        </div>

        {/* §4 portfolio events + §5 news wire */}
        <div className="mt-7 grid gap-6 lg:grid-cols-2">
          <section>
            <SectionHeader
              title="On your holdings"
              count={o.portfolio_events.length}
              hint="earnings · filings · IPOs"
            />
            <div className="card space-y-2.5 p-4">
              {o.portfolio_events.map((e) => (
                <PortfolioEventRow key={e.id} e={e} onOpen={onOpenClient} />
              ))}
            </div>
          </section>

          <section>
            <SectionHeader
              title="News wire"
              count={o.news.length}
              hint="tagged to who it touches"
            />
            <div className="card space-y-2.5 p-4">
              {o.news.map((n) => (
                <NewsRow key={n.id} n={n} onOpen={onOpenClient} />
              ))}
            </div>
          </section>
        </div>

        <p className="mt-8 text-center text-[11px] text-slate-400">
          Every card is grounded — click a “source”, “why”, “log” or “holding” tag to see the citation.
          Advisory only: the desk orients, the RM acts, the client decides.
        </p>
      </div>
    </div>
  );
}

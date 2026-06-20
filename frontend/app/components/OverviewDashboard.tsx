"use client";

// The RM's morning landing page (docs/OVERVIEW_CONTRACT.md). One glanceable desk view
// across all clients — priority tasks, upcoming meetings, market moves, portfolio events
// and the news wire — every card grounded in a real source. Detail lives one click away:
// any client name drills into ClientView. This view decides nothing; it orients the RM.

import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, ChevronRight, FileText, Rocket } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { ClientAvatar } from "./ClientAvatar";
import { Collapsible, MandatePill, PolarityChip } from "./ui";
import { ProvenanceTag } from "./Provenance";

/* ---------------------------------------------------------------- tokens --- */

const SEVERITY: Record<
  Severity,
  { rail: string; chip: string; label: string }
> = {
  high: {
    rail: "bg-destructive",
    chip: "bg-destructive/10 text-destructive ring-destructive/20",
    label: "Urgent",
  },
  med: {
    rail: "bg-warning",
    chip: "bg-warning/10 text-warning ring-warning/20",
    label: "Follow up",
  },
  low: {
    rail: "bg-muted-foreground/40",
    chip: "bg-muted text-muted-foreground ring-border",
    label: "Watch",
  },
};

const EVENT_KIND: Record<
  PortfolioEvent["kind"],
  { Icon: typeof BarChart3; label: string; cls: string }
> = {
  earnings: { Icon: BarChart3, label: "Earnings", cls: "bg-primary/10 text-primary ring-primary/20" },
  filing: { Icon: FileText, label: "Filing", cls: "bg-purple/10 text-purple ring-purple/20" },
  ipo: { Icon: Rocket, label: "IPO watch", cls: "bg-success/10 text-success ring-success/20" },
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
    up: { glyph: "▲", cls: "text-success" },
    down: { glyph: "▼", cls: "text-destructive" },
    flat: { glyph: "▬", cls: "text-muted-foreground" },
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
      className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[11px] font-medium text-muted-foreground"
    >
      {label}
      <span className="rounded bg-muted px-1 text-[9px] uppercase tracking-wide text-muted-foreground">
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
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {typeof count === "number" && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground">
          {count}
        </span>
      )}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
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
      tone: k.priority_tasks ? "text-destructive" : "text-ink",
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
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
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
              className="text-sm font-semibold text-ink hover:text-primary hover:underline"
            >
              {task.client_name}
            </button>
            <MandatePill mandate={task.mandate} />
            <span className={`chip ring-1 ring-inset ${sev.chip}`}>{sev.label}</span>
            <PolarityChip polarity={task.polarity} />
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{task.reason}</p>

          <div className="mt-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground ring-1 ring-inset ring-border">
            <p>
              <span className="font-semibold text-muted-foreground">Trigger · {task.trigger_source}</span>{" "}
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

/* ------------------------------------------------- priority grouping §1 --- */

const SEV_ORDER: Record<Severity, number> = { high: 0, med: 1, low: 2 };

interface ClientTaskGroupData {
  client_id: string;
  client_name: string;
  mandate: string;
  tasks: OverviewTask[];
  top_severity: Severity;
}

function groupTasksByClient(tasks: OverviewTask[]): ClientTaskGroupData[] {
  const map = new Map<string, ClientTaskGroupData>();
  for (const t of tasks) {
    const g =
      map.get(t.client_id) ??
      {
        client_id: t.client_id,
        client_name: t.client_name,
        mandate: t.mandate,
        tasks: [],
        top_severity: "low" as Severity,
      };
    g.tasks.push(t);
    map.set(t.client_id, g);
  }
  for (const g of map.values()) {
    g.tasks.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
    g.top_severity = g.tasks[0].severity;
  }
  // most urgent clients first, then by how many issues they carry
  return [...map.values()].sort(
    (a, b) =>
      SEV_ORDER[a.top_severity] - SEV_ORDER[b.top_severity] ||
      b.tasks.length - a.tasks.length,
  );
}

function ClientTaskGroup({
  group,
  onOpen,
}: {
  group: ClientTaskGroupData;
  onOpen: (id: string) => void;
}) {
  const sev = SEVERITY[group.top_severity];
  return (
    <Collapsible
      defaultOpen
      trigger={(open, toggle) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
            open && "rounded-b-none",
          )}
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
            aria-hidden
          />
          <ClientAvatar clientId={group.client_id} name={group.client_name} size="sm" />
          <span className="text-sm font-semibold text-ink">{group.client_name}</span>
          <MandatePill mandate={group.mandate} />
          <span className={`chip ring-1 ring-inset ${sev.chip}`}>{sev.label}</span>
          <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground">
            {group.tasks.length}
          </span>
        </button>
      )}
    >
      <div className="space-y-3 rounded-b-lg border border-t-0 border-border p-3">
        {group.tasks.map((t) => (
          <TaskCard key={t.id} task={t} onOpen={onOpen} />
        ))}
      </div>
    </Collapsible>
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
    <div className="flex items-start gap-3 rounded-lg border border-border p-3">
      <div className="grid w-12 shrink-0 place-items-center rounded-lg bg-primary-subtle py-1.5 text-center">
        <span className="text-base font-bold leading-none text-primary">{d}</span>
        <span className="text-[10px] uppercase text-primary/70">{mon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpen(m.client_id)}
            className="text-sm font-semibold text-ink hover:text-primary hover:underline"
          >
            {m.client_name}
          </button>
          <span className="text-xs text-muted-foreground">
            {m.time} · {m.channel}
          </span>
          {m.has_alert && (
            <span className="chip bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/20">
              has a task
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-ink-soft">
          <span className="font-medium">{m.agenda}</span>
          {m.venue ? ` · ${m.venue}` : ""}
        </p>
        {m.last_met && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
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
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <DirectionMark direction={mv.direction} />
        <p className="flex-1 text-sm font-medium text-ink">{mv.headline}</p>
        <span className="text-[11px] text-muted-foreground">{prettyDate(mv.published_at)}</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{mv.summary}</p>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
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
  const KindIcon = kind.Icon;
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <span className={`chip inline-flex items-center gap-1 ring-1 ring-inset ${kind.cls}`}>
          <KindIcon className="h-3.5 w-3.5" aria-hidden /> {kind.label}
        </span>
        <p className="flex-1 text-sm font-medium text-ink">{e.title}</p>
        <span className="text-[11px] text-muted-foreground">{e.day_label}</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{e.detail}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Held by</span>
        {e.held_by.map((h) => (
          <button
            key={h.client_id}
            type="button"
            onClick={() => onOpen(h.client_id)}
            title={`Open ${h.client_name}`}
            className="flex items-center gap-1 rounded-full bg-muted py-0.5 pl-0.5 pr-2 ring-1 ring-inset ring-border hover:bg-accent"
          >
            <ClientAvatar clientId={h.client_id} name={h.client_name} size="sm" className="!h-5 !w-5 !ring-0" />
            <span className="text-[11px] text-muted-foreground">{firstName(h.client_name)}</span>
          </button>
        ))}
        <span className="ml-auto text-[11px] font-medium text-muted-foreground">
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
    conflict: "bg-warning",
    opportunity: "bg-success",
    neutral: "bg-muted-foreground",
  };
  return (
    <button
      type="button"
      onClick={() => onOpen(ref_.client_id)}
      title={`${ref_.polarity} · open ${ref_.client_name}`}
      className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-[11px] text-muted-foreground ring-1 ring-inset ring-border hover:bg-muted"
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
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">{n.source}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">{prettyDate(n.published_at)}</span>
      </div>
      <p className="mt-0.5 text-sm font-medium text-ink">{n.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={`chip ring-1 ring-inset ${
            up
              ? "bg-success/10 text-success ring-success/20"
              : down
              ? "bg-destructive/10 text-destructive ring-destructive/20"
              : "bg-muted text-muted-foreground ring-border"
          }`}
        >
          {n.sentiment_label} {n.sentiment_score >= 0 ? "+" : ""}
          {n.sentiment_score.toFixed(2)}
        </span>
        {n.topics.map((t) => (
          <span key={t} className="chip bg-muted text-muted-foreground ring-1 ring-inset ring-border">
            {titleCase(t)}
          </span>
        ))}
        <ProvenanceTag prov={n.provenance} label="source" />
      </div>
      {n.relevant_clients.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Affects</span>
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
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        Loading the desk…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="grid h-full place-items-center px-8 text-center">
        <div>
          <p className="text-sm font-medium text-destructive">Could not load the overview.</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <p className="mt-2 text-xs text-muted-foreground">Is the API running on http://localhost:8000?</p>
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
            <span className="text-sm text-muted-foreground">
              {prettyDate(o.today)} ·{" "}
              {o.use_live ? "live data" : "seed data"}
            </span>
          </div>
          <div className="mt-2 flex items-start gap-2 rounded-lg bg-primary-subtle px-4 py-2.5 text-sm text-primary ring-1 ring-inset ring-primary/20">
            <span className="shrink-0 rounded bg-card/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              Briefing
            </span>
            <span className="leading-relaxed">{o.briefing}</span>
            <span className="ml-auto hidden shrink-0 sm:block">
              <SoonButton label="Send as SMS" title="Twilio morning briefing" />
            </span>
          </div>
        </header>

        <KpiStrip o={o} />

        {/* §1 priority tasks — collapsible section, grouped per client */}
        <section className="mt-7">
          <Collapsible
            defaultOpen
            trigger={(open, toggle) => (
              <div className="mb-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggle}
                  aria-expanded={open}
                  className="group flex items-center gap-2"
                >
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      open && "rotate-90",
                    )}
                    aria-hidden
                  />
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground transition-colors group-hover:text-primary">
                    Priority — touch base
                  </h2>
                </button>
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground">
                  {o.priority_tasks.length}
                </span>
                <span className="text-xs text-muted-foreground">
                  a world event hit their profile
                </span>
              </div>
            )}
          >
            {o.priority_tasks.length === 0 ? (
              <div className="card p-5 text-sm text-muted-foreground">
                Nothing flagged across the book this morning.
              </div>
            ) : (
              <div className="space-y-3">
                {groupTasksByClient(o.priority_tasks).map((g) => (
                  <ClientTaskGroup key={g.client_id} group={g} onOpen={onOpenClient} />
                ))}
              </div>
            )}
          </Collapsible>
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
                <p className="text-sm text-muted-foreground">No notable macro moves.</p>
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

        <p className="mt-8 text-center text-[11px] text-muted-foreground">
          Every card is grounded — click a “source”, “why”, “log” or “holding” tag to see the citation.
          Advisory only: the desk orients, the RM acts, the client decides.
        </p>
      </div>
    </div>
  );
}

"use client";

// The RM's morning landing page (docs/OVERVIEW_CONTRACT.md). One glanceable desk view
// across all clients — priority tasks and upcoming meetings — every card grounded in a
// real source. Detail lives one click away: any client name drills into ClientView.
// This view decides nothing; it orients the RM.

import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type {
  Overview,
  OverviewTask,
  OverviewMeeting,
  NewsWireItem,
  Severity,
  Polarity,
  MeUser,
} from "@/lib/types";
import { api } from "@/lib/api";
import { chf, prettyDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ClientAvatar } from "./ClientAvatar";
import { LinkPreviewThumb } from "./LinkPreviewThumb";
import { Collapsible, MandatePill, PolarityChip } from "./ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PRIORITY_PREVIEW = 3;

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

function SectionHeader({
  title,
  count,
  hint,
  action,
  className,
}: {
  title: string;
  count?: number;
  hint?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center gap-2", className)}>
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

function KpiStrip({ o, className }: { o: Overview; className?: string }) {
  const k = o.kpis;
  const cells: { label: string; value: string; tone?: string }[] = [
    { label: "Clients", value: String(k.clients) },
    {
      label: "Priority tasks",
      value: String(k.priority_tasks),
      tone: k.priority_tasks ? "text-destructive" : "text-ink",
    },
    { label: "Meetings", value: String(k.meetings_upcoming) },
    { label: "Assets under advice", value: compactChf(k.aum_chf) },
  ];
  return (
    <div className={cn("grid grid-cols-2 grid-rows-2 gap-2", className)}>
      {cells.map((c) => (
        <div
          key={c.label}
          className="card flex min-h-[5.25rem] flex-col justify-center px-3 py-2.5"
        >
          <p
            className={cn(
              "truncate text-2xl font-semibold leading-none",
              c.tone ?? "text-ink",
            )}
          >
            {c.value}
          </p>
          <p className="mt-1.5 text-[11px] font-medium uppercase leading-snug tracking-wide text-muted-foreground">
            {c.label}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------- priority §1 --- */

const SEV_ORDER: Record<Severity, number> = { high: 0, med: 1, low: 2 };
const POLARITY_ORDER: Record<Polarity, number> = {
  conflict: 0,
  opportunity: 1,
  neutral: 2,
};

function taskTriggerUrl(task: OverviewTask, wire: NewsWireItem[]): string | null {
  for (const p of task.provenance) {
    if (p.url) return p.url;
  }
  return wire.find((n) => n.title === task.trigger_headline)?.url ?? null;
}

// Probe candidate URLs in parallel and return the first that has a real OG image.
// Renders immediately with the initial guess, then swaps to the best thumbnail once
// the (cached) previews settle — no layout shift, just a better image appearing.
function useBestThumbnailUrl(
  group: ClientTaskGroupData,
  newsWire: NewsWireItem[],
): string | null {
  const [bestUrl, setBestUrl] = useState<string | null>(() =>
    taskTriggerUrl(group.tasks[0], newsWire),
  );

  useEffect(() => {
    const seen = new Set<string>();
    const candidates: string[] = [];

    // All provenance URLs across every task for this client
    for (const task of group.tasks) {
      for (const p of task.provenance) {
        if (p.url && !seen.has(p.url)) {
          seen.add(p.url);
          candidates.push(p.url);
        }
      }
    }
    // News wire items that reference this client (the "More related stories")
    for (const n of newsWire) {
      const url = n.url ?? n.provenance.url ?? null;
      if (
        url &&
        !seen.has(url) &&
        n.relevant_clients.some((r) => r.client_id === group.client_id)
      ) {
        seen.add(url);
        candidates.push(url);
      }
    }

    if (candidates.length === 0) return;

    let alive = true;
    Promise.all(
      candidates.slice(0, 8).map((url) =>
        api.linkPreview(url)
          .then((p) => ({ url, preview: p }))
          .catch(() => null),
      ),
    ).then((results) => {
      if (!alive) return;
      const hit = results.find((r) => r?.preview.preview_kind === "thumbnail");
      if (hit) setBestUrl(hit.url);
    });

    return () => {
      alive = false;
    };
  }, [group.client_id]); // eslint-disable-line react-hooks/exhaustive-deps

  return bestUrl;
}

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
    g.tasks.sort(
      (a, b) =>
        SEV_ORDER[a.severity] - SEV_ORDER[b.severity] ||
        POLARITY_ORDER[a.polarity] - POLARITY_ORDER[b.polarity],
    );
    g.top_severity = g.tasks[0].severity;
  }
  // most urgent clients first, then by how many issues they carry
  return [...map.values()].sort(
    (a, b) =>
      SEV_ORDER[a.top_severity] - SEV_ORDER[b.top_severity] ||
      b.tasks.length - a.tasks.length,
  );
}

function PriorityClientTile({
  group,
  newsWire,
  onOpen,
}: {
  group: ClientTaskGroupData;
  newsWire: NewsWireItem[];
  onOpen: (id: string) => void;
}) {
  const top = group.tasks[0];
  const sev = SEVERITY[group.top_severity];
  const count = group.tasks.length;
  const extra = count - 1;
  const triggerUrl = useBestThumbnailUrl(group, newsWire);

  return (
    <button
      type="button"
      onClick={() => onOpen(group.client_id)}
      className="card group w-full overflow-hidden p-0 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="flex flex-col">
        {triggerUrl ? (
          <LinkPreviewThumb
            url={triggerUrl}
            layout="thumbnail-stretch"
            className="aspect-video h-auto w-full min-h-0 rounded-none border-b border-border/50 ring-0"
          />
        ) : (
          <div className="aspect-video w-full border-b border-border/50 bg-muted/40" aria-hidden />
        )}
        <div className="flex min-w-0 flex-col p-4">
          <div className="flex flex-wrap items-center gap-2">
            <ClientAvatar clientId={group.client_id} name={group.client_name} size="sm" />
            <span className="text-sm font-semibold text-ink">{group.client_name}</span>
            <MandatePill mandate={group.mandate} />
            <span className={`chip ring-1 ring-inset ${sev.chip}`}>{sev.label}</span>
            <PolarityChip polarity={top.polarity} />
            {extra > 0 && (
              <span className="chip bg-muted text-muted-foreground ring-1 ring-inset ring-border">
                {count} signals
              </span>
            )}
          </div>
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-soft">{top.reason}</p>
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {extra > 0 ? (
              <>
                <span className="font-medium text-ink-soft">Lead story</span> · {top.trigger_source} —{" "}
                {top.trigger_headline}
              </>
            ) : (
              <>
                {top.trigger_source} — {top.trigger_headline}
              </>
            )}
          </p>
          <span className="mt-2 flex items-center gap-1 text-xs font-medium text-primary">
            Open {firstName(group.client_name)}
            <ChevronRight
              className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </span>
        </div>
      </div>
    </button>
  );
}

function PriorityClientsGrid({
  groups,
  newsWire,
  onOpen,
  className,
}: {
  groups: ClientTaskGroupData[];
  newsWire: NewsWireItem[];
  onOpen: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3", className)}>
      {groups.map((g) => (
        <PriorityClientTile
          key={g.client_id}
          group={g}
          newsWire={newsWire}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function PriorityTouchBase({
  priorityClients,
  newsWire,
  onOpenClient,
}: {
  priorityClients: ClientTaskGroupData[];
  newsWire: NewsWireItem[];
  onOpenClient: (id: string) => void;
}) {
  const [allOpen, setAllOpen] = useState(false);
  const preview = priorityClients.slice(0, PRIORITY_PREVIEW);
  const hasMore = priorityClients.length > PRIORITY_PREVIEW;

  const openClient = (id: string) => {
    setAllOpen(false);
    onOpenClient(id);
  };

  return (
    <>
      <PriorityClientsGrid groups={preview} newsWire={newsWire} onOpen={openClient} />
      {hasMore && (
        <button
          type="button"
          onClick={() => setAllOpen(true)}
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Show all {priorityClients.length} clients
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      )}
      <Dialog open={allOpen} onOpenChange={setAllOpen}>
        <DialogContent className="max-h-[85vh] max-w-5xl gap-4 overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Priority — touch base</DialogTitle>
            <DialogDescription>
              {priorityClients.length} client{priorityClients.length !== 1 ? "s" : ""} flagged
              after a world event hit their profile.
            </DialogDescription>
          </DialogHeader>
          <PriorityClientsGrid
            groups={priorityClients}
            newsWire={newsWire}
            onOpen={openClient}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------ meetings §2 --- */

function meetingLabel(m: OverviewMeeting): string {
  const title = m.agenda || m.client_name;
  return m.venue ? `${title} | ${m.venue}` : title;
}

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
    <button
      type="button"
      onClick={() => onOpen(m.client_id)}
      className="flex w-full min-w-0 items-center gap-2.5 rounded-lg border border-border p-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="grid w-10 shrink-0 place-items-center rounded-md bg-primary-subtle py-1 text-center">
        <span className="text-sm font-bold leading-none text-primary">{d}</span>
        <span className="text-[9px] uppercase leading-none text-primary/70">{mon}</span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink" title={m.client_name}>
          {meetingLabel(m)}
        </p>
        <p className="text-xs text-muted-foreground">{m.time}</p>
      </div>
    </button>
  );
}

function MeetingsStrip({
  meetings,
  onOpen,
  className,
}: {
  meetings: OverviewMeeting[];
  onOpen: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {meetings.map((m) => (
        <MeetingRow key={m.id} m={m} onOpen={onOpen} />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- the page --- */

export function OverviewDashboard({
  onOpenClient,
  user,
}: {
  onOpenClient: (id: string) => void;
  user?: MeUser | null;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await api.refreshLiveNews();
      } catch {
        // best-effort — still load whatever is already in world.news
      }
      if (!alive) return;
      try {
        const d = await api.overview();
        if (alive) setData(d);
      } catch (e) {
        if (alive) setError(String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="scroll-thin h-full overflow-y-auto">
        <div className="mx-auto max-w-6xl animate-pulse px-8 py-6">
          {/* greeting */}
          <div className="mb-5">
            <div className="h-8 w-64 rounded-lg bg-muted" />
          </div>

          {/* kpi strip + meetings */}
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[35%_65%] lg:grid-rows-[auto_1fr] lg:gap-x-4 lg:gap-y-3">
            <SectionHeader
              title="At a glance"
              className="order-1 !mb-0 lg:order-none lg:col-start-1 lg:row-start-1"
            />
            <div className="order-2 lg:order-none lg:col-start-1 lg:row-start-2">
              <div className="grid grid-cols-2 grid-rows-2 gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="card min-h-[5.25rem] px-3 py-2.5">
                    <div className="h-5 w-10 rounded bg-muted" />
                    <div className="mt-2 h-2.5 w-16 rounded bg-muted" />
                  </div>
                ))}
              </div>
            </div>
            <SectionHeader
              title="Meetings coming up"
              count={4}
              className="order-3 !mb-0 lg:order-none lg:col-start-2 lg:row-start-1"
            />
            <div className="order-4 flex flex-col gap-2 lg:order-none lg:col-start-2 lg:row-start-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-2 rounded-lg border border-border p-2">
                  <div className="h-10 w-10 shrink-0 rounded-md bg-muted" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-full rounded bg-muted" />
                    <div className="h-2.5 w-10 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* priority tasks */}
          <div className="mt-7">
            <div className="mb-3 h-4 w-40 rounded bg-muted" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card overflow-hidden p-0">
                  <div className="aspect-video w-full border-b border-border/50 bg-muted" />
                  <div className="space-y-2 p-4">
                    <div className="flex gap-2">
                      <div className="h-8 w-8 shrink-0 rounded-full bg-muted" />
                      <div className="h-4 w-28 rounded bg-muted" />
                      <div className="h-4 w-16 rounded bg-muted" />
                    </div>
                    <div className="h-3 w-full rounded bg-muted" />
                    <div className="h-3 w-4/5 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
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
  const priorityClients = groupTasksByClient(o.priority_tasks);

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-8 py-6">
        {/* greeting */}
        <header className="mb-5">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="font-display text-3xl font-light tracking-tight text-ink">
              {greeting()}, {firstName(user?.name || o.rm_name)}
            </h1>
            <span className="text-sm text-muted-foreground">
              {prettyDate(o.today)} ·{" "}
              {o.use_live ? "live data" : "seed data"}
            </span>
          </div>
        </header>

        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[35%_65%] lg:grid-rows-[auto_1fr] lg:gap-x-4 lg:gap-y-3">
          <SectionHeader
            title="At a glance"
            className="order-1 !mb-0 lg:order-none lg:col-start-1 lg:row-start-1"
          />
          <KpiStrip o={o} className="order-2 lg:order-none lg:col-start-1 lg:row-start-2" />
          <SectionHeader
            title="Meetings coming up"
            count={o.meetings.length}
            className="order-3 !mb-0 lg:order-none lg:col-start-2 lg:row-start-1"
          />
          <MeetingsStrip
            meetings={o.meetings}
            onOpen={onOpenClient}
            className="order-4 lg:order-none lg:col-start-2 lg:row-start-2"
          />
        </div>

        {/* §1 priority tasks — one tile per client, drill in for detail */}
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
                  {priorityClients.length || o.priority_tasks.length}
                </span>
                <span className="text-xs text-muted-foreground">
                  {priorityClients.length > 0
                    ? `${priorityClients.length} client${priorityClients.length !== 1 ? "s" : ""} · a world event hit their profile`
                    : "a world event hit their profile"}
                </span>
              </div>
            )}
          >
            {o.priority_tasks.length === 0 ? (
              <div className="card p-5 text-sm text-muted-foreground">
                Nothing flagged across the book this morning.
              </div>
            ) : (
              <PriorityTouchBase
                priorityClients={priorityClients}
                newsWire={o.news}
                onOpenClient={onOpenClient}
              />
            )}
          </Collapsible>
        </section>

        <p className="mt-8 text-center text-[11px] text-muted-foreground">
          Every card is grounded — click a “source”, “why”, “log” or “holding” tag to see the citation.
          Advisory only: the desk orients, the RM acts, the client decides.
        </p>
      </div>
    </div>
  );
}

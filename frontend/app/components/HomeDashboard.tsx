"use client";

import { useMemo } from "react";
import { ArrowRight, Bell, ShieldCheck } from "lucide-react";
import type { ClientSummary } from "@/lib/types";
import { ClientAvatar } from "./ClientAvatar";
import { MandatePill, FigureCard } from "./ui";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Book-level home — the calm landing the RM sees first. Answers "who needs me
 * today" in two seconds: a one-line book band, the clients sorted by urgency,
 * and a system-derived alert inbox. Click any client to drill in.
 */
export function HomeDashboard({
  clients,
  onSelectClient,
}: {
  clients: ClientSummary[];
  onSelectClient: (id: string) => void;
}) {
  const sorted = useMemo(
    () =>
      [...clients].sort(
        (a, b) => b.alert_count - a.alert_count || a.name.localeCompare(b.name)
      ),
    [clients]
  );

  const openAlerts = useMemo(
    () => clients.reduce((n, c) => n + c.alert_count, 0),
    [clients]
  );
  const needAttention = useMemo(
    () => clients.filter((c) => c.alert_count > 0),
    [clients]
  );

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-8 py-6">
        {/* hero */}
        <header className="mb-6">
          <h1 className="font-display text-4xl font-light tracking-tight text-foreground">
            My book
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {clients.length} client{clients.length === 1 ? "" : "s"} ·{" "}
            {openAlerts} open alert{openAlerts === 1 ? "" : "s"} — sorted by what
            needs you first.
          </p>
        </header>

        {/* book band */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FigureCard label="Clients" value={String(clients.length)} />
          <FigureCard
            label="Open alerts"
            value={String(openAlerts)}
            tone={openAlerts > 0 ? "amber" : "ink"}
          />
          <FigureCard
            label="Need attention"
            value={String(needAttention.length)}
            tone={needAttention.length > 0 ? "amber" : "ink"}
          />
          <FigureCard
            label="Steady"
            value={String(clients.length - needAttention.length)}
          />
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {/* client cards, urgency-sorted */}
          <section>
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Clients
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {sorted.map((c) => (
                <button
                  key={c.client_id}
                  type="button"
                  onClick={() => onSelectClient(c.client_id)}
                  className="card group p-4 text-left transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start gap-3">
                    <ClientAvatar
                      clientId={c.client_id}
                      name={c.name}
                      size="lg"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {c.name}
                        </span>
                        {c.alert_count > 0 && (
                          <Badge
                            variant="outline"
                            className="h-5 shrink-0 rounded-full border-warning/30 bg-warning/10 px-1.5 text-[11px] font-semibold tabular-nums text-warning"
                          >
                            {c.alert_count} alert
                            {c.alert_count === 1 ? "" : "s"}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1.5">
                        <MandatePill mandate={c.mandate} />
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {c.headline}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover:text-primary">
                    Open client
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* today's alerts inbox */}
          <aside>
            <p className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Bell className="h-3.5 w-3.5" aria-hidden />
              Today&rsquo;s alerts
              {openAlerts > 0 && (
                <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
                  {openAlerts}
                </span>
              )}
            </p>
            {needAttention.length === 0 ? (
              <div className="card p-4 text-sm text-muted-foreground">
                No open alerts across the book today. New alerts appear here as
                incoming news and CIO updates intersect a client&rsquo;s profile.
              </div>
            ) : (
              <div className="card divide-y divide-border overflow-hidden">
                {needAttention.map((c) => (
                  <button
                    key={c.client_id}
                    type="button"
                    onClick={() => onSelectClient(c.client_id)}
                    className="flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-accent"
                  >
                    <ClientAvatar
                      clientId={c.client_id}
                      name={c.name}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {c.name}
                        </span>
                        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-warning">
                          {c.alert_count}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {c.headline}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <p className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Advisory only — the RM approves, the client decides.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

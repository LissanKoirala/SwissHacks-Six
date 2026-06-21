"use client";

import { useMemo } from "react";
import { Home, LayoutGrid, Briefcase, Newspaper, ShieldCheck, ChevronRight } from "lucide-react";
import type { ClientSummary, IntegrationHealth } from "@/lib/types";
import { ClientAvatar } from "./ClientAvatar";
import { MandatePill } from "./ui";
import { ThemeToggle } from "./ThemeToggle";
import { AccountMenu } from "./AccountMenu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DESK_BRAND_MARK_HEIGHT, DESK_BRAND_STRIP_HEIGHT } from "@/lib/layout";

export function Sidebar({
  clients,
  selectedId,
  onSelect,
  onHome,
  overviewActive,
  health,
  onShowTasks,
  tasksActive,
  onShowWorkspace,
  workspaceActive,
  onShowNews,
  newsActive,
}: {
  clients: ClientSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHome: () => void;
  overviewActive: boolean;
  health: IntegrationHealth | null;
  onShowTasks: () => void;
  tasksActive: boolean;
  onShowWorkspace: () => void;
  workspaceActive: boolean;
  onShowNews: () => void;
  newsActive: boolean;
}) {
  const totalAlerts = clients.reduce((s, c) => s + (c.alert_count || 0), 0);
  // Triage-ordered book: the most urgent client floats to the top.
  const sorted = useMemo(
    () =>
      [...clients].sort(
        (a, b) => b.alert_count - a.alert_count || a.name.localeCompare(b.name)
      ),
    [clients]
  );
  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* workspace header */}
      <button
        type="button"
        onClick={onHome}
        className={cn(
          "flex shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4 text-left hover:bg-accent",
          DESK_BRAND_STRIP_HEIGHT,
        )}
      >
        <div
          className={cn(
            "grid w-7 shrink-0 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground",
            DESK_BRAND_MARK_HEIGHT,
          )}
        >
          AW
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold tracking-tight text-foreground">
            Advisory Workbench
          </p>
          <p className="truncate text-xs text-muted-foreground">
            Relationship-manager desk
          </p>
        </div>
      </button>

      {/* primary nav */}
      <div className="space-y-0.5 px-2 pt-2">
        <button
          type="button"
          onClick={onHome}
          aria-current={overviewActive ? "page" : undefined}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors",
            overviewActive
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <Home className="h-4 w-4 shrink-0" />
          <span className="flex-1">Overview</span>
          {totalAlerts > 0 && (
            <Badge
              variant="outline"
              className="h-5 shrink-0 rounded-full border-warning/30 bg-warning/10 px-1.5 text-[11px] font-semibold tabular-nums text-warning"
            >
              {totalAlerts}
            </Badge>
          )}
        </button>
        <button
          type="button"
          onClick={onShowTasks}
          aria-current={tasksActive ? "page" : undefined}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors",
            tasksActive
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <LayoutGrid className="h-4 w-4 shrink-0" />
          Tasks board
        </button>
        <button
          type="button"
          onClick={onShowWorkspace}
          aria-current={workspaceActive ? "page" : undefined}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors",
            workspaceActive
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <Briefcase className="h-4 w-4 shrink-0" />
          Workspace
        </button>
        <button
          type="button"
          onClick={onShowNews}
          aria-current={newsActive ? "page" : undefined}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors",
            newsActive
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <Newspaper className="h-4 w-4 shrink-0" />
          News feed
        </button>
      </div>

      {/* clients section */}
      <div className="px-4 pb-1.5 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Clients
        </p>
      </div>

      <nav className="scroll-thin flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
        {sorted.map((c) => {
          const active = c.client_id === selectedId;
          return (
            <button
              key={c.client_id}
              type="button"
              onClick={() => onSelect(c.client_id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "w-full rounded-md px-2.5 py-2 text-left transition-colors",
                active
                  ? "bg-primary/10 ring-1 ring-inset ring-primary/20"
                  : "hover:bg-accent"
              )}
            >
              <div className="flex items-start gap-2.5">
                <ClientAvatar clientId={c.client_id} name={c.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "truncate text-sm font-medium",
                        active ? "text-primary" : "text-foreground/90"
                      )}
                    >
                      {c.name}
                    </span>
                    {c.alert_count > 0 && (
                      <Badge
                        variant="outline"
                        className="h-5 shrink-0 rounded-full border-warning/30 bg-warning/10 px-1.5 text-[11px] font-semibold tabular-nums text-warning"
                      >
                        {c.alert_count}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <MandatePill mandate={c.mandate} />
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {c.headline}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* integration health footer — collapsed by default (dev diagnostics) */}
      {health && (
        <details className="group border-t border-sidebar-border px-4 py-3">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
            <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
            Integrations · {health.use_live ? "live" : "seed"}
          </summary>
          <ul className="mt-2 space-y-1">
            {health.probes.map((p) => (
              <li
                key={p.name}
                className="flex items-center gap-2 text-[11px] text-muted-foreground"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    p.live ? "bg-success" : "bg-muted-foreground/40"
                  )}
                />
                <span className="font-medium text-foreground/80">{p.name}</span>
                <span className="ml-auto tabular-nums">{p.mode}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* account + morning-briefing settings */}
      <AccountMenu />

      {/* theme + advisory hint */}
      <div className="flex items-center justify-between gap-2 border-t border-sidebar-border px-2.5 py-2">
        <span className="inline-flex items-center gap-1.5 px-1 text-[11px] font-medium text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Advisory only
        </span>
        <ThemeToggle />
      </div>
    </aside>
  );
}

"use client";

import { LayoutGrid, ShieldCheck } from "lucide-react";
import type { ClientSummary, IntegrationHealth } from "@/lib/types";
import { ClientAvatar } from "./ClientAvatar";
import { MandatePill } from "./ui";
import { ThemeToggle } from "./ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function Sidebar({
  clients,
  selectedId,
  onSelect,
  health,
  onShowTasks,
  tasksActive,
}: {
  clients: ClientSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  health: IntegrationHealth | null;
  onShowTasks: () => void;
  tasksActive: boolean;
}) {
  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* workspace header */}
      <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-3.5">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          AW
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-base font-light tracking-tight text-foreground">
            Advisory Workbench
          </p>
          <p className="truncate text-xs text-muted-foreground">
            Relationship-manager desk
          </p>
        </div>
      </div>

      {/* primary nav */}
      <div className="px-2 pt-2">
        <button
          type="button"
          onClick={onShowTasks}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors",
            tasksActive
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <LayoutGrid className="h-4 w-4 shrink-0" />
          Tasks board
        </button>
      </div>

      {/* clients section */}
      <div className="px-4 pb-1.5 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Clients
        </p>
      </div>

      <nav className="scroll-thin flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
        {clients.map((c) => {
          const active = c.client_id === selectedId;
          return (
            <button
              key={c.client_id}
              type="button"
              onClick={() => onSelect(c.client_id)}
              className={cn(
                "w-full rounded-md px-2.5 py-2 text-left transition-colors",
                active ? "bg-accent" : "hover:bg-accent"
              )}
            >
              <div className="flex items-start gap-2.5">
                <ClientAvatar clientId={c.client_id} name={c.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "truncate text-sm font-medium",
                        active ? "text-foreground" : "text-foreground/90"
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

      {/* integration health footer */}
      {health && (
        <div className="border-t border-sidebar-border px-4 py-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Integrations · {health.use_live ? "live" : "seed"}
          </p>
          <ul className="space-y-1">
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
        </div>
      )}

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

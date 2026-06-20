"use client";

import type { ClientSummary, IntegrationHealth } from "@/lib/types";
import { ClientAvatar } from "./ClientAvatar";
import { MandatePill } from "./ui";

export function Sidebar({
  clients,
  selectedId,
  onSelect,
  health,
}: {
  clients: ClientSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  health: IntegrationHealth | null;
}) {
  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-5">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-bold text-white">
            AW
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Advisory Workbench</p>
            <p className="text-xs text-slate-500">Relationship-manager desk</p>
          </div>
        </div>
      </div>

      <div className="px-5 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Clients
        </p>
      </div>

      <nav className="scroll-thin flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {clients.map((c) => {
          const active = c.client_id === selectedId;
          return (
            <button
              key={c.client_id}
              type="button"
              onClick={() => onSelect(c.client_id)}
              className={`w-full rounded-lg px-3 py-3 text-left transition-colors ${
                active
                  ? "bg-accent-soft ring-1 ring-inset ring-accent/30"
                  : "hover:bg-slate-50"
              }`}
            >
              <div className="flex items-start gap-3">
                <ClientAvatar clientId={c.client_id} name={c.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-sm font-medium ${
                        active ? "text-accent-ink" : "text-ink"
                      }`}
                    >
                      {c.name}
                    </span>
                    {c.alert_count > 0 && (
                      <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-amber-500 px-1 text-[11px] font-bold text-white">
                        {c.alert_count}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <MandatePill mandate={c.mandate} />
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
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
        <div className="border-t border-slate-200 px-5 py-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Integrations · {health.use_live ? "live" : "seed"}
          </p>
          <ul className="space-y-1">
            {health.probes.map((p) => (
              <li
                key={p.name}
                className="flex items-center gap-2 text-[11px] text-slate-500"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    p.live ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                />
                <span className="font-medium text-slate-600">{p.name}</span>
                <span className="ml-auto text-slate-400">{p.mode}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

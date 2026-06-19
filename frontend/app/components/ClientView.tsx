"use client";

import { useEffect, useState } from "react";
import type { Insights } from "@/lib/types";
import { api } from "@/lib/api";
import { prettyDate } from "@/lib/format";
import { MandatePill } from "./ui";
import { AlertCard } from "./AlertCard";
import { StrategyPanel } from "./StrategyPanel";
import { DialoguePanel } from "./DialoguePanel";
import { PortfolioView } from "./PortfolioView";
import { ProfileView } from "./ProfileView";

type Tab = "advisory" | "portfolio" | "profile";

export function ClientView({ clientId }: { clientId: string }) {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("advisory");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setInsights(null);
    setTab("advisory");
    api
      .insights(clientId)
      .then((d) => alive && setInsights(d))
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [clientId]);

  if (loading) {
    return (
      <div className="grid h-full place-items-center text-sm text-slate-500">
        Loading insights…
      </div>
    );
  }
  if (error) {
    return (
      <div className="grid h-full place-items-center px-8 text-center">
        <div>
          <p className="text-sm font-medium text-rose-600">
            Could not reach the backend.
          </p>
          <p className="mt-1 text-xs text-slate-500">{error}</p>
          <p className="mt-2 text-xs text-slate-400">
            Is the API running on http://localhost:8000?
          </p>
        </div>
      </div>
    );
  }
  if (!insights) return null;

  const { client } = insights;
  const affectedIsin = insights.matches[0]?.affected_holding?.isin ?? null;

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-8 py-6">
        {/* header */}
        <header className="mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-ink">{client.name}</h1>
            <MandatePill mandate={client.mandate} />
            <span className="text-xs text-slate-400">
              generated {prettyDate(insights.generated_at)} ·{" "}
              {insights.llm_used ? "LLM" : "deterministic"}
            </span>
          </div>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-soft">
            {client.headline}
          </p>
        </header>

        {/* advisory-only banner — golden rule */}
        <div className="mb-6 flex items-center gap-2 rounded-lg bg-accent-soft px-4 py-2.5 text-sm text-accent-ink ring-1 ring-inset ring-accent/20">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M8 7.2v4M8 5.2h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>
            <span className="font-semibold">Advisory only</span> — the RM
            approves, the client decides. Nothing here is auto-executed or
            auto-sent.
          </span>
        </div>

        {/* tabs */}
        <div className="mb-6 flex gap-1 border-b border-slate-200">
          {([
            ["advisory", `Advisory${client.alert_count ? ` · ${client.alert_count}` : ""}`],
            ["portfolio", "Portfolio"],
            ["profile", "Profile"],
          ] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === id
                  ? "border-accent text-accent-ink"
                  : "border-transparent text-slate-500 hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* tab content */}
        {tab === "advisory" && (
          <div className="space-y-6">
            {insights.matches.length === 0 ? (
              <div className="card p-6 text-sm text-slate-500">
                No active alerts. The profile is being watched against incoming
                news and the CIO list.
              </div>
            ) : (
              <div className="space-y-4">
                {insights.matches.map((m) => (
                  <AlertCard key={m.id} match={m} />
                ))}
              </div>
            )}

            {/* dual output — the product core */}
            <div className="grid gap-5 lg:grid-cols-2">
              <StrategyPanel proposal={insights.strategy_proposal} />
              <DialoguePanel dialogue={insights.dialogue_suggestion} />
            </div>
          </div>
        )}

        {tab === "portfolio" && (
          <PortfolioView clientId={clientId} affectedIsin={affectedIsin} />
        )}

        {tab === "profile" && <ProfileView clientId={clientId} />}
      </div>
    </div>
  );
}

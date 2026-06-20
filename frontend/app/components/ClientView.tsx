"use client";

import { useEffect, useState } from "react";
import type { Insights } from "@/lib/types";
import { api } from "@/lib/api";
import { prettyDate } from "@/lib/format";
import { ClientAvatar } from "./ClientAvatar";
import { MandatePill } from "./ui";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertCard } from "./AlertCard";
import { StrategyPanel } from "./StrategyPanel";
import { DialoguePanel } from "./DialoguePanel";
import { PortfolioView } from "./PortfolioView";
import { ProfileView } from "./ProfileView";
import { PortfolioCharts } from "./PortfolioCharts";
import { InvestmentGlobe } from "./InvestmentGlobe";
import { CrmGraph } from "./CrmGraph";
import { DecisionFlow } from "./DecisionFlow";
import { RendezvousView } from "./RendezvousView";
import { RiskTimeline } from "./RiskTimeline";
import { CaptureNote } from "./CaptureNote";

type Tab =
  | "advisory"
  | "decision"
  | "portfolio"
  | "analytics"
  | "risk"
  | "map"
  | "network"
  | "rendezvous"
  | "profile"
  | "capture";

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
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        Loading insights…
      </div>
    );
  }
  if (error) {
    return (
      <div className="grid h-full place-items-center px-8 text-center">
        <div>
          <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
            Could not reach the backend.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <p className="mt-2 text-xs text-muted-foreground">
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
            <ClientAvatar
              clientId={client.client_id}
              name={client.name}
              size="lg"
            />
            <h1 className="text-2xl font-semibold text-foreground">{client.name}</h1>
            <MandatePill mandate={client.mandate} />
            <span className="text-xs text-muted-foreground">
              generated {prettyDate(insights.generated_at)} ·{" "}
              {insights.llm_used ? "LLM" : "deterministic"}
            </span>
          </div>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-foreground/80">
            {client.headline}
          </p>
        </header>

        {/* advisory-only banner — golden rule */}
        <div className="mb-6 flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2.5 text-sm text-primary ring-1 ring-inset ring-primary/20">
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
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <div className="scroll-thin mb-6 overflow-x-auto">
            <TabsList className="h-auto flex-nowrap">
              {([
                ["advisory", `Advisory${client.alert_count ? ` · ${client.alert_count}` : ""}`],
                ["decision", "Decision Flow"],
                ["portfolio", "Portfolio"],
                ["analytics", "Analytics"],
                ["risk", "Risk Timeline"],
                ["map", "Investment Map"],
                ["network", "CRM Network"],
                ["rendezvous", "Rendezvous"],
                ["profile", "Profile"],
                ["capture", "＋ Add Note"],
              ] as [Tab, string][]).map(([id, label]) => (
                <TabsTrigger key={id} value={id} className="shrink-0">
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* tab content */}
          <TabsContent value="advisory" className="mt-0">
            <div className="space-y-6">
              {insights.matches.length === 0 ? (
                <div className="card p-6 text-sm text-muted-foreground">
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
          </TabsContent>

          <TabsContent value="decision" className="mt-0">
            <DecisionFlow clientId={clientId} />
          </TabsContent>

          <TabsContent value="portfolio" className="mt-0">
            <PortfolioView clientId={clientId} affectedIsin={affectedIsin} />
          </TabsContent>

          <TabsContent value="analytics" className="mt-0">
            <PortfolioCharts clientId={clientId} />
          </TabsContent>

          <TabsContent value="risk" className="mt-0">
            <RiskTimeline clientId={clientId} />
          </TabsContent>

          <TabsContent value="map" className="mt-0">
            <InvestmentGlobe clientId={clientId} />
          </TabsContent>

          <TabsContent value="network" className="mt-0">
            <CrmGraph clientId={clientId} />
          </TabsContent>

          <TabsContent value="rendezvous" className="mt-0">
            <RendezvousView clientId={clientId} />
          </TabsContent>

          <TabsContent value="profile" className="mt-0">
            <ProfileView clientId={clientId} />
          </TabsContent>

          <TabsContent value="capture" className="mt-0">
            <CaptureNote clientId={clientId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

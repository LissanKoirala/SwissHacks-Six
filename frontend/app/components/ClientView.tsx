"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Info, Plus } from "lucide-react";
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
import { OpportunitiesPanel } from "./OpportunitiesPanel";
import { TransactionsView } from "./TransactionsView";

type Tab =
  | "advisory"
  | "decision"
  | "portfolio"
  | "activity"
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
          <p className="text-sm font-medium text-destructive">
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
  const primaryMatchId = insights.matches[0]?.id ?? null;
  const primaryBuyIsin =
    insights.strategy_proposal?.swaps.find((s) => s.buy_isin && s.sell_isin)
      ?.buy_isin ??
    insights.strategy_proposal?.swaps.find((s) => s.buy_isin)?.buy_isin ??
    null;

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
            <h1 className="font-display text-4xl font-light tracking-tight text-foreground">
              {client.name}
            </h1>
            <MandatePill mandate={client.mandate} />
            <span className="text-xs text-muted-foreground">
              Generated{" "}
              <span className="font-mono tabular-nums">
                {prettyDate(insights.generated_at)}
              </span>{" "}
              · {insights.llm_used ? "LLM" : "deterministic"}
            </span>
          </div>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-foreground/80">
            {client.headline}
          </p>
        </header>

        {/* advisory-only banner — golden rule */}
        <div className="mb-6 flex items-center gap-2 rounded-md bg-primary/10 px-4 py-2.5 text-sm text-primary ring-1 ring-inset ring-primary/20">
          <Info className="h-4 w-4 shrink-0" aria-hidden />
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
                ["activity", "Transactions"],
                ["analytics", "Analytics"],
                ["risk", "Risk Timeline"],
                ["map", "Investment Map"],
                ["network", "CRM Network"],
                ["rendezvous", "Rendezvous"],
                ["profile", "Profile"],
                [
                  "capture",
                  <span key="cap" className="flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    Add Note
                  </span>,
                ],
              ] as [Tab, ReactNode][]).map(([id, label]) => (
                <TabsTrigger key={id as string} value={id as string} className="shrink-0">
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* tab content */}
          <TabsContent value="advisory" className="mt-0">
            <div className="space-y-6">
              {insights.matches.length === 0 ? (
                <div className="card p-5 text-sm text-muted-foreground">
                  No signals matched this client&rsquo;s profile against today&rsquo;s
                  news and the CIO list. New alerts appear here as incoming items
                  intersect a profile topic. Capture a meeting note to broaden the
                  topics watched.
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
                <StrategyPanel
                  proposal={insights.strategy_proposal}
                  clientId={clientId}
                  matchId={primaryMatchId}
                  currentBuyIsin={primaryBuyIsin}
                />
                <DialoguePanel dialogue={insights.dialogue_suggestion} />
              </div>

              {/* additional proposals — other distinct salient matches (e.g. a separate opportunity) */}
              {insights.additional_proposals &&
                insights.additional_proposals.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-medium tracking-wide text-muted-foreground">
                      Other flagged proposals ·{" "}
                      {insights.additional_proposals.length}
                    </p>
                    <div className="grid gap-5 lg:grid-cols-2">
                      {insights.additional_proposals.map((p, i) => (
                        <StrategyPanel key={`add-${i}`} proposal={p} />
                      ))}
                    </div>
                  </div>
                )}

              {/* proactive: NEW unheld opportunities aligned to the client's DNA */}
              <OpportunitiesPanel clientId={clientId} />
            </div>
          </TabsContent>

          <TabsContent value="decision" className="mt-0">
            <DecisionFlow clientId={clientId} />
          </TabsContent>

          <TabsContent value="portfolio" className="mt-0">
            <PortfolioView clientId={clientId} affectedIsin={affectedIsin} />
          </TabsContent>

          <TabsContent value="activity" className="mt-0">
            <TransactionsView clientId={clientId} />
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

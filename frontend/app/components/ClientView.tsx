"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ArrowLeft, CalendarClock, Plus } from "lucide-react";
import type {
  Insights,
  Analytics,
  LifeEventSignal,
  StrategyProposal,
  SwapAction,
} from "@/lib/types";
import { api } from "@/lib/api";
import { prettyDate, chf } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ClientAvatar } from "./ClientAvatar";
import { MandatePill, FigureCard, Expander, PolarityChip } from "./ui";
import { ProvenanceTag } from "./Provenance";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertCard, groupMatchesByHeadline } from "./AlertCard";
import { StrategyPanel } from "./StrategyPanel";
import { DialoguePanel } from "./DialoguePanel";
import { TwinPanel } from "./TwinPanel";
import { AskTwinPanel } from "./AskTwinPanel";
import { PortfolioView } from "./PortfolioView";
import { ProfileView } from "./ProfileView";
import { PortfolioCharts } from "./PortfolioCharts";
import { InvestmentGlobe } from "./InvestmentGlobe";
import { CrmGraph } from "./CrmGraph";
import { DecisionFlow } from "./DecisionFlow";
import { RiskTimeline } from "./RiskTimeline";
import { CaptureNote } from "./CaptureNote";
import { OpportunitiesPanel } from "./OpportunitiesPanel";
import { AuditPanel } from "./AuditPanel";
import { ClientWorkspace } from "./ClientWorkspace";
import { TransactionsView } from "./TransactionsView";

function loadRendezvousView() {
  return import("./RendezvousView").catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const isChunkLoad =
      (error instanceof Error && error.name === "ChunkLoadError") ||
      /loading chunk .* failed/i.test(message);
    if (isChunkLoad && typeof window !== "undefined") {
      const key = "rendezvous-chunk-reload";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
        return new Promise<typeof import("./RendezvousView")>(() => {});
      }
      sessionStorage.removeItem(key);
    }
    throw error;
  });
}

// Rendezvous pulls in WebGL globe + live flights — lazy, client-only.
const RendezvousView = dynamic(() => loadRendezvousView(), {
  ssr: false,
  loading: () => (
    <p className="p-5 text-sm text-muted-foreground">Loading rendezvous planner…</p>
  ),
});

type Area = "advisory" | "portfolio" | "client" | "capture";
type PortfolioSub = "holdings" | "audit" | "allocation" | "transactions" | "risk" | "map";
type ClientSub = "profile" | "network" | "rendezvous" | "workspace";

const ACTION_CHIP: Record<SwapAction, string> = {
  SWAP: "bg-primary/10 text-primary ring-primary/30",
  INCREASE: "bg-success/10 text-success ring-success/20",
  HOLD: "bg-muted text-muted-foreground ring-border",
  DIVEST: "bg-destructive/10 text-destructive ring-destructive/20",
  REDUCE: "bg-warning/10 text-warning ring-warning/20",
};

/* ------------------------------------------------------------ KPI band --- */

function ClientKpiBand({ a }: { a: Analytics }) {
  const f = a.figures;
  const deviations = (f.off_list_count ?? 0) + (f.sell_rated_count ?? 0);
  const sentTone: "green" | "red" = f.weighted_sentiment >= 0 ? "green" : "red";
  const sentVal = `${f.weighted_sentiment >= 0 ? "+" : ""}${f.weighted_sentiment.toFixed(
    2
  )}`;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <FigureCard label="Total value" value={chf(f.total_chf)} />
      <FigureCard
        label="Drift breaches"
        value={String(f.drift_breaches)}
        tone={f.drift_breaches > 0 ? "amber" : "ink"}
        hint="vs ±2.0pp"
      />
      <FigureCard
        label="Open alerts"
        value={String(f.alerts)}
        tone={f.alerts > 0 ? "amber" : "ink"}
      />
      <FigureCard
        label="CIO deviations"
        value={String(deviations)}
        tone={deviations > 0 ? "amber" : "ink"}
      />
      <FigureCard label="News sentiment" value={sentVal} tone={sentTone} />
      <FigureCard label="Regions" value={String(f.regions)} />
    </div>
  );
}

/* --------------------------------------------------------- sub-nav --- */

function SubNav<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="scroll-thin mb-5 overflow-x-auto">
      <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange(it.id)}
            aria-current={value === it.id ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              value === it.id
                ? "bg-card text-foreground shadow-card dark:shadow-none"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------- recommendation strip --- */

/**
 * The one-line glance answer to "what surfaced and what do I propose", built
 * from the strategy proposal already in hand — no extra fetch. The full,
 * node-by-node decision trace expands lazily underneath on demand.
 */
function RecommendationStrip({
  proposal,
  clientId,
}: {
  proposal: StrategyProposal | null;
  clientId: string;
}) {
  const lead = proposal?.swaps?.[0] ?? null;
  const move =
    lead?.sell_issuer && lead?.buy_issuer
      ? `Sell ${lead.sell_issuer} → Buy ${lead.buy_issuer}`
      : lead?.buy_issuer
      ? `Buy ${lead.buy_issuer}`
      : lead?.sell_issuer
      ? `Review ${lead.sell_issuer}`
      : null;

  if (!proposal || proposal.swaps.length === 0) {
    return (
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip bg-muted font-semibold text-muted-foreground ring-1 ring-inset ring-border">
            No action
          </span>
          <span className="text-sm font-medium text-foreground">
            {proposal?.headline ??
              "Within mandate and values — nothing to propose."}
          </span>
        </div>
        <div className="mt-3">
          <Expander label="Trace this call" summary="full decision path · sources">
            <DecisionFlow clientId={clientId} />
          </Expander>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        {lead && (
          <span
            className={cn(
              "chip font-semibold ring-1 ring-inset",
              ACTION_CHIP[lead.action] ?? ACTION_CHIP.HOLD
            )}
          >
            {lead.action}
          </span>
        )}
        {move && <span className="hl text-sm font-semibold">{move}</span>}
        <span className="ml-auto">
          <PolarityChip polarity={proposal.polarity} />
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {proposal.headline}
      </p>
      <div className="mt-3">
        <Expander label="Trace this call" summary="full decision path · sources">
          <DecisionFlow clientId={clientId} />
        </Expander>
      </div>
    </div>
  );
}

/* ----------------------------------------------------- life-event banner --- */

/**
 * Life-event-aware timing (#5): a documented event/belief-shift that recently reshaped this
 * client's priorities — mined from the *dates* on their DNA vs today. Prompts the desk to check the
 * stated mandate still matches the revealed priorities. Every line cites the log it came from (§2).
 */
function LifeEventBanner({ events }: { events: LifeEventSignal[] }) {
  if (!events.length) return null;
  return (
    <div className="mb-6 rounded-md border border-primary/20 bg-primary/[0.06] px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-primary">
        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
        Life-event timing — verify the mandate still fits who he is now
      </p>
      <ul className="mt-2 space-y-2">
        {events.map((e, i) => (
          <li key={`${e.date}-${i}`} className="text-sm text-foreground/80">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-semibold text-foreground">{e.label}</span>
              <span className="text-xs text-muted-foreground">
                {e.months_ago <= 0
                  ? "this month"
                  : `${e.months_ago} month${e.months_ago === 1 ? "" : "s"} ago`}
              </span>
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
              {e.implication}
              <ProvenanceTag prov={e.provenance} label="CRM" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------ component --- */

export function ClientView({ clientId }: { clientId: string }) {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [area, setArea] = useState<Area>("advisory");
  const [portfolioSub, setPortfolioSub] = useState<PortfolioSub>("holdings");
  const [clientSub, setClientSub] = useState<ClientSub>("profile");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setInsights(null);
    setAnalytics(null);
    setArea("advisory");
    setPortfolioSub("holdings");
    setClientSub("profile");
    api
      .insights(clientId)
      .then((d) => alive && setInsights(d))
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    // KPI band is best-effort enrichment; it must never block the page.
    api
      .analytics(clientId)
      .then((a) => alive && setAnalytics(a))
      .catch(() => {});
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
        <header className="mb-5">
          <div className="flex flex-wrap items-center gap-3">
            <ClientAvatar
              clientId={client.client_id}
              name={client.name}
              size="lg"
            />
            <h1 className="font-display text-[2.5rem] leading-[1.1] font-light tracking-tight text-foreground">
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
            <button
              type="button"
              onClick={() => setArea("capture")}
              className="btn-ghost ml-auto px-3 py-1.5"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add note
            </button>
          </div>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-foreground/80">
            {client.headline}
          </p>
        </header>

        {/* client KPI band — state legible before any tab is opened */}
        {analytics && (
          <div className="mb-5">
            <ClientKpiBand a={analytics} />
          </div>
        )}

        {/* life-event timing (#5) — the human moment, surfaced even with no news match */}
        {insights.life_events && insights.life_events.length > 0 && (
          <LifeEventBanner events={insights.life_events} />
        )}

        {area === "capture" ? (
          <section>
            <button
              type="button"
              onClick={() => setArea("advisory")}
              className="btn-ghost mb-4 px-3 py-1.5"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to advisory
            </button>
            <CaptureNote clientId={clientId} />
          </section>
        ) : (
          <Tabs value={area} onValueChange={(v) => setArea(v as Area)}>
            <TabsList className="mb-6">
              <TabsTrigger value="advisory">
                Advisory
                {client.alert_count ? ` · ${client.alert_count}` : ""}
              </TabsTrigger>
              <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
              <TabsTrigger value="client">Client</TabsTrigger>
            </TabsList>

            {/* ADVISORY — glance strip, alert triage, dual output, opportunities */}
            <TabsContent value="advisory" className="mt-0">
              <div className="space-y-6">
                <RecommendationStrip
                  proposal={insights.strategy_proposal}
                  clientId={clientId}
                />

                {insights.matches.length === 0 ? (
                  <div className="card p-5 text-sm text-muted-foreground">
                    No signals matched this client&rsquo;s profile against
                    today&rsquo;s news and the CIO list. New alerts appear here as
                    incoming items intersect a profile topic. Capture a meeting
                    note to broaden the topics watched.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {groupMatchesByHeadline(insights.matches).map((group) => (
                      <AlertCard
                        key={group.map((m) => m.id).join(":")}
                        matches={group}
                      />
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
                  <DialoguePanel
                    dialogue={insights.dialogue_suggestion}
                    clientId={clientId}
                    clientName={client.name}
                  />
                </div>

                {/* Client Digital Twin — a cited pre-mortem on the proposal: stance + drivers,
                    plus ask-the-twin + autoformat. Supersedes the lighter reaction panel. */}
                <TwinPanel clientId={clientId} />

                {/* ask the twin anything → autoformat into a message */}
                <AskTwinPanel clientId={clientId} clientName={client.name} />

                {/* additional proposals — collapsed by default */}
                {insights.additional_proposals &&
                  insights.additional_proposals.length > 0 && (
                    <Expander
                      label="Other flagged proposals"
                      count={insights.additional_proposals.length}
                    >
                      <div className="grid gap-5 lg:grid-cols-2">
                        {insights.additional_proposals.map((p, i) => (
                          <StrategyPanel key={`${p.headline}-${i}`} proposal={p} />
                        ))}
                      </div>
                    </Expander>
                  )}

                {/* proactive: NEW unheld opportunities aligned to the client's DNA */}
                <OpportunitiesPanel clientId={clientId} />
              </div>
            </TabsContent>

            {/* PORTFOLIO — holdings · allocation · transactions · risk · map */}
            <TabsContent value="portfolio" className="mt-0">
              <SubNav
                value={portfolioSub}
                onChange={setPortfolioSub}
                items={[
                  { id: "holdings", label: "Holdings" },
                  { id: "audit", label: "Audit" },
                  { id: "allocation", label: "Allocation" },
                  { id: "transactions", label: "Transactions" },
                  { id: "risk", label: "Risk Timeline" },
                  { id: "map", label: "Investment Map" },
                ]}
              />
              {portfolioSub === "holdings" && (
                <PortfolioView clientId={clientId} affectedIsin={affectedIsin} />
              )}
              {portfolioSub === "audit" && <AuditPanel clientId={clientId} />}
              {portfolioSub === "allocation" && (
                <PortfolioCharts clientId={clientId} />
              )}
              {portfolioSub === "transactions" && (
                <TransactionsView clientId={clientId} />
              )}
              {portfolioSub === "risk" && <RiskTimeline clientId={clientId} />}
              {portfolioSub === "map" && (
                <InvestmentGlobe clientId={clientId} matches={insights.matches} />
              )}
            </TabsContent>

            {/* CLIENT — profile · network · rendezvous */}
            <TabsContent value="client" className="mt-0">
              <SubNav
                value={clientSub}
                onChange={setClientSub}
                items={[
                  { id: "profile", label: "Profile" },
                  { id: "network", label: "CRM Network" },
                  { id: "rendezvous", label: "Rendezvous" },
                  { id: "workspace", label: "Workspace" },
                ]}
              />
              {clientSub === "profile" && <ProfileView clientId={clientId} />}
              {clientSub === "network" && <CrmGraph clientId={clientId} />}
              {clientSub === "rendezvous" && (
                <RendezvousView clientId={clientId} />
              )}
              {clientSub === "workspace" && (
                <ClientWorkspace clientId={clientId} clientName={client.name} />
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronRight,
  Glasses,
  Hash,
  Loader2,
  MessageSquareQuote,
  Newspaper,
  PartyPopper,
  Sparkles,
} from "lucide-react";
import type { LensFraming, Match, MatchResolution, RelevanceScore, SourceType, Swap } from "@/lib/types";
import { api } from "@/lib/api";
import { chf, prettyDate, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { IssuerLogo } from "./IssuerLogo";
import {
  PolarityChip,
  RelevanceMeter,
  SentimentChip,
  SourceBadge,
  Collapsible,
  Expander,
} from "./ui";
import { Provenance, ProvenanceTag } from "./Provenance";
import { LinkPreviewThumb } from "./LinkPreviewThumb";

/** Group matches that share the same alert headline into one card. */
export function groupMatchesByHeadline(matches: Match[]): Match[][] {
  const groups = new Map<string, Match[]>();
  const order: string[] = [];
  for (const match of matches) {
    if (!groups.has(match.headline)) {
      groups.set(match.headline, []);
      order.push(match.headline);
    }
    groups.get(match.headline)!.push(match);
  }
  return order.map((headline) => groups.get(headline)!);
}

/**
 * The Client Lens (#1): the same generic news, rewritten through THIS client's documented
 * worldview — quoting their own prior words back to them. The hero of the card: the news adapts to
 * the reader. Both the client's quote and the news are cited (Trust, §2).
 */
function LensHero({ lens, celebrate }: { lens: LensFraming; celebrate: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        celebrate
          ? "border-success/30 bg-success/5"
          : "border-primary/30 bg-primary/[0.06]"
      )}
    >
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium tracking-wide text-primary">
        <Glasses className="h-3.5 w-3.5" />
        Through the client&rsquo;s lens
        {lens.draft_source === "llm" && (
          <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary ring-1 ring-inset ring-primary/20">
            AI-framed
          </span>
        )}
      </p>
      <h3 className="text-lg font-semibold leading-snug tracking-tight text-foreground">
        {lens.headline}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-foreground/80">
        {lens.narrative}
      </p>
      {lens.provenance.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Grounded in</span>
          {lens.provenance.map((p, i) => (
            <ProvenanceTag
              key={`${p.source_id}-${i}`}
              prov={p}
              label={p.source_type === "crm_log" ? "their words" : "the news"}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The conviction-weighted relevance breakdown (#2): why this item scored what it did FOR THIS
 * CLIENT — every factor a tinted bar with its own source. The breakdown, not the bare number, is
 * the trust surface (CLAUDE.md §2).
 */
function RelevanceBreakdown({ relevance }: { relevance: RelevanceScore }) {
  return (
    <div className="mt-3">
      <Expander
        label={`Why it scored ${relevance.score}`}
        summary="conviction · exposure · sentiment · freshness"
      >
        <div className="space-y-2.5 rounded-md border border-border p-3">
          {relevance.components.map((c, i) => {
            const pct = c.max_points > 0 ? (c.points / c.max_points) * 100 : 0;
            return (
              <div key={`${c.label}-${i}`}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-foreground/80">{c.label}</span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <span className="tabular-nums text-foreground/80">
                      {c.points.toFixed(1)}
                    </span>
                    <span className="text-[10px]">/ {c.max_points}</span>
                    {c.provenance && <ProvenanceTag prov={c.provenance} />}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                  />
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{c.detail}</p>
              </div>
            );
          })}
          <p className="border-t border-border/60 pt-2 text-[11px] tabular-nums text-muted-foreground">
            {relevance.summary}
          </p>
        </div>
      </Expander>
    </div>
  );
}

function WhySurfacedContent({ match }: { match: Match }) {
  return (
    <div className="space-y-3">
      {match.shared_topics.map((st, i) => (
        <div
          key={`${st.topic}-${i}`}
          className="rounded-md border border-border p-3"
        >
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground">
            <Hash className="h-3.5 w-3.5" />
            Shared topic · <span className="hl">{titleCase(st.topic)}</span>
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground">
                <MessageSquareQuote className="h-3.5 w-3.5" />
                What the client said
              </p>
              <Provenance prov={st.client_provenance} />
            </div>
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground">
                <Newspaper className="h-3.5 w-3.5" />
                What the news says
              </p>
              <Provenance prov={st.news_provenance} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** CRM log excerpt vs news excerpt — used in alert cards and map holding popovers. */
export function MatchCrmNewsContrast({ match }: { match: Match }) {
  if (match.shared_topics.length === 0) return null;
  return <WhySurfacedContent match={match} />;
}

function NewsPreview({ match }: { match: Match }) {
  const { news } = match;
  const sourceUrl = news.url ?? news.provenance.url ?? null;
  const topicSummary = Array.from(
    new Set(match.shared_topics.map((st) => titleCase(st.topic)))
  ).join(", ");

  return (
    <div className="overflow-hidden rounded-md bg-muted/40">
      <Collapsible
        defaultOpen={false}
        trigger={(open, toggle) => (
          <div className="grid grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0 p-3">
              <p className="text-sm font-medium text-foreground">{news.title}</p>
              <p className="mt-1.5 text-xs font-medium text-foreground/80">
                {news.source}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="font-mono tabular-nums">
                  {prettyDate(news.published_at)}
                </span>
                <SentimentChip label={news.sentiment.label} />
                <span className="text-muted-foreground">
                  score{" "}
                  <span className="tabular-nums">
                    {news.sentiment.score.toFixed(2)}
                  </span>
                </span>
              </div>
            </div>
            {sourceUrl ? (
              <LinkPreviewThumb
                url={sourceUrl}
                layout="thumbnail-stretch"
                className="col-start-2 row-span-2 row-start-1"
              />
            ) : null}
            <div className="col-start-1 row-start-2 border-t border-border/50 px-3 pb-3 pt-2.5">
              <button
                type="button"
                onClick={toggle}
                className={cn(
                  "flex max-w-full items-center gap-2 text-sm font-medium transition-colors",
                  open
                    ? "text-primary"
                    : "text-muted-foreground hover:text-primary"
                )}
                aria-expanded={open}
              >
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 transition-transform",
                    open && "rotate-90"
                  )}
                />
                <span className="shrink-0">Why this surfaced</span>
                <span className="shrink-0 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
                  {match.shared_topics.length}
                </span>
                {topicSummary && (
                  <span
                    className={cn(
                      "truncate text-xs font-normal text-muted-foreground",
                      open && "invisible"
                    )}
                  >
                    · {topicSummary}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}
      >
        <div className="border-t border-border/50 px-3 pb-3 pt-3">
          <WhySurfacedContent match={match} />
        </div>
      </Collapsible>
    </div>
  );
}

function AffectedHolding({ match }: { match: Match }) {
  if (!match.affected_holding) return null;
  const h = match.affected_holding;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning ring-1 ring-inset ring-warning/20">
      <IssuerLogo issuer={h.issuer} isin={h.isin} yahoo={h.yahoo} size="sm" />
      <span className="font-medium">Affected holding</span>
      <span className="text-foreground/80">·</span>
      <span className="text-foreground/80">{h.issuer}</span>
      <span className="text-muted-foreground">({h.industry_group})</span>
      <span className="ml-auto font-semibold tabular-nums">
        {chf(h.current_chf)}
      </span>
    </div>
  );
}

function AlertStory({ match }: { match: Match }) {
  return (
    <div className="space-y-3">
      <NewsPreview match={match} />
      <AffectedHolding match={match} />
    </div>
  );
}

function sortMatchesByRecency(matches: Match[]): Match[] {
  return [...matches].sort(
    (a, b) =>
      new Date(b.news.published_at).getTime() -
      new Date(a.news.published_at).getTime()
  );
}

/** Best alert for a specific held position — direct issuer/conflict first, else thematic. */
export function pickPrimaryMatchForHolding(
  matches: Match[],
  holdingIsin: string,
): Match {
  const direct = matches.filter(
    (m) =>
      m.affected_holding?.isin === holdingIsin ||
      m.news.issuer_isin === holdingIsin,
  );
  if (direct.length > 0) return sortMatchesByRecency(direct)[0];
  return sortMatchesByRecency(matches)[0];
}

/** Advisory matches tied to a held position (by ISIN). */
export function matchesForHoldingIsin(isin: string, matches: Match[]): Match[] {
  return sortMatchesByRecency(
    matches.filter((m) => m.affected_holding?.isin === isin),
  );
}

/** Map each held ISIN to advisory matches (direct + map story links). */
export function buildHoldingAdvisoryIndex(
  holdings: { id: string; isin: string }[],
  matches: Match[],
  stories: { id: string; linked_holding_ids: string[] }[],
): Map<string, Match[]> {
  const map = new Map<string, Match[]>();
  const add = (isin: string, match: Match) => {
    if (!map.has(isin)) map.set(isin, []);
    const list = map.get(isin)!;
    if (!list.some((m) => m.id === match.id)) list.push(match);
  };

  for (const m of matches) {
    if (m.affected_holding?.isin) add(m.affected_holding.isin, m);
    if (m.news.issuer_isin) add(m.news.issuer_isin, m);
  }

  for (const story of stories) {
    const newsId = story.id.replace(/^(event|news):/, "");
    const storyMatch = matches.find((m) => m.news.id === newsId);
    if (!storyMatch) continue;
    for (const hid of story.linked_holding_ids) {
      const h = holdings.find((x) => x.id === hid);
      if (h) add(h.isin, storyMatch);
    }
  }

  for (const [isin, list] of map) {
    map.set(isin, sortMatchesByRecency(list));
  }
  return map;
}

function SwapResolutionCard({ swap }: { swap: Swap }) {
  if (swap.action === "HOLD" && !swap.sell_issuer && !swap.buy_issuer) {
    return null;
  }

  return (
    <div className="rounded-md border border-border bg-card p-2.5">
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-foreground">
        {swap.sell_issuer ? (
          <>
            <IssuerLogo issuer={swap.sell_issuer} isin={swap.sell_isin} size="sm" />
            <span>{swap.sell_issuer}</span>
          </>
        ) : null}
        {swap.sell_issuer && swap.buy_issuer ? (
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        ) : null}
        {swap.buy_issuer ? (
          <>
            <IssuerLogo issuer={swap.buy_issuer} isin={swap.buy_isin} size="sm" />
            <span>{swap.buy_issuer}</span>
          </>
        ) : null}
        {swap.amount_chf > 0 ? (
          <span className="ml-auto tabular-nums text-muted-foreground">{chf(swap.amount_chf)}</span>
        ) : null}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{swap.rationale}</p>
      {swap.substitution?.vol_sell != null && swap.substitution?.vol_buy != null ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Vol match: {(swap.substitution.vol_sell * 100).toFixed(0)}% →{" "}
          {(swap.substitution.vol_buy * 100).toFixed(0)}%
        </p>
      ) : null}
    </div>
  );
}

/** On-demand resolution draft (deterministic substitution + optional small-model summary). */
export function ResolutionSuggestion({
  clientId,
  matchId,
  holdingIsin,
}: {
  clientId: string;
  matchId: string;
  holdingIsin: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [resolution, setResolution] = useState<MatchResolution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    requestSeq.current += 1;
    setState("idle");
    setResolution(null);
    setError(null);
  }, [clientId, matchId, holdingIsin]);

  const load = async (refresh = false) => {
    const seq = ++requestSeq.current;
    setState("loading");
    setError(null);
    try {
      const data = await api.matchResolution(clientId, matchId, holdingIsin, refresh);
      if (seq !== requestSeq.current) return;
      if (data.match_id !== matchId) {
        throw new Error("Resolution returned the wrong match — try again.");
      }
      if (data.holding_isin && data.holding_isin !== holdingIsin) {
        throw new Error("Resolution returned the wrong holding — try again.");
      }
      setResolution(data);
      setState("done");
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setError(e instanceof Error ? e.message : "Could not load resolution");
      setState("error");
    }
  };

  const swap = resolution?.strategy_proposal.swaps.find(
    (s) =>
      s.action !== "HOLD" ||
      s.sell_issuer ||
      s.buy_issuer ||
      (s.amount_chf ?? 0) > 0,
  ) ?? null;

  return (
    <div className="border-t border-border pt-3">
      {state === "idle" ? (
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Suggest a resolution
        </button>
      ) : null}

      {state === "loading" ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Drafting a CIO-approved substitution…
        </p>
      ) : null}

      {state === "error" ? (
        <div className="space-y-2">
          <p className="text-xs text-destructive">{error}</p>
          <button
            type="button"
            onClick={() => load()}
            className="text-xs font-medium text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      ) : null}

      {state === "done" && resolution ? (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Suggested resolution
            </p>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {resolution.source === "llm" ? "AI draft" : "Deterministic"}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-foreground">{resolution.summary}</p>
          {swap ? <SwapResolutionCard swap={swap} /> : null}
          <button
            type="button"
            onClick={() => load(true)}
            className="text-[11px] font-medium text-muted-foreground hover:text-primary hover:underline"
          >
            Refresh draft
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Condensed alert summary for map holding popovers. */
export function CondensedMatchPreview({
  clientId,
  holdingIsin,
  matches,
}: {
  clientId: string;
  holdingIsin: string;
  matches: Match[];
}) {
  if (matches.length === 0) return null;
  const primary = pickPrimaryMatchForHolding(matches, holdingIsin);
  const { news } = primary;
  const sourceUrl = news.url ?? news.provenance.url ?? null;
  const signalTypes = Array.from(
    new Set(
      matches
        .map((m) => m.news.signal_type)
        .filter((t): t is string => !!t && t !== "news"),
    ),
  );
  const reasonLabel =
    primary.polarity === "conflict"
      ? "Reason for conflict"
      : primary.polarity === "opportunity"
        ? "Why this is an opportunity"
        : "Why this surfaced";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <PolarityChip polarity={primary.polarity} />
        {signalTypes.map((type) => (
          <SourceBadge key={type} type={type as SourceType} />
        ))}
      </div>

      <div className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {reasonLabel}
        </p>
        <p className="text-sm font-semibold leading-snug text-foreground">
          {primary.headline}
        </p>
      </div>

      <MatchCrmNewsContrast match={primary} />

      <div className="rounded-md bg-muted/40 p-2.5">
        <p className="text-xs font-medium leading-snug text-foreground">
          {news.title}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/80">{news.source}</span>
          <span className="font-mono tabular-nums">{prettyDate(news.published_at)}</span>
          <SentimentChip label={news.sentiment.label} />
        </div>
      </div>

      {matches.length > 1 ? (
        <p className="text-[11px] text-muted-foreground">
          {matches.length} related alert{matches.length === 1 ? "" : "s"} for this
          holding
        </p>
      ) : null}

      {sourceUrl ? (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs font-medium text-primary hover:underline"
        >
          Read source article →
        </a>
      ) : null}

      <ResolutionSuggestion
        key={`${holdingIsin}:${primary.id}`}
        clientId={clientId}
        matchId={primary.id}
        holdingIsin={holdingIsin}
      />
    </div>
  );
}

export function AlertCard({ matches }: { matches: Match[] }) {
  // Lead with the highest-relevance match in the group (backend already ranks by it); recency
  // breaks ties so the freshest of an equally-relevant pair shows first.
  const sorted = [...matches].sort((a, b) => {
    const ra = a.relevance?.score ?? 0;
    const rb = b.relevance?.score ?? 0;
    if (rb !== ra) return rb - ra;
    return (
      new Date(b.news.published_at).getTime() -
      new Date(a.news.published_at).getTime()
    );
  });
  const primary = sorted[0];
  const moreStories = sortMatchesByRecency(sorted.slice(1));
  const celebrate = !!primary.celebrate;
  const lens = primary.lens ?? null;
  const relevance = primary.relevance ?? null;
  const topics = Array.from(
    new Set(matches.flatMap((m) => m.news.topics))
  ).sort();
  const signalTypes = Array.from(
    new Set(
      matches
        .map((m) => m.news.signal_type)
        .filter((t): t is string => !!t && t !== "news")
    )
  );

  return (
    <article
      className={cn(
        "card overflow-hidden",
        celebrate && "ring-1 ring-inset ring-success/30"
      )}
    >
      {celebrate && (
        <div className="flex items-center gap-2 bg-success/10 px-5 py-2 text-sm font-semibold text-success">
          <PartyPopper className="h-4 w-4 shrink-0" aria-hidden />
          Call to celebrate — the good news this client asked to hear.
        </div>
      )}
      <div className="p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <PolarityChip polarity={primary.polarity} />
          {signalTypes.map((type) => (
            <SourceBadge key={type} type={type as SourceType} />
          ))}
          {topics.map((t) => (
            <span
              key={t}
              className="chip bg-muted text-muted-foreground ring-1 ring-inset ring-border"
            >
              #{t}
            </span>
          ))}
          {relevance && (
            <span className="ml-auto">
              <RelevanceMeter score={relevance.score} />
            </span>
          )}
        </div>

        {/* Hero: the news reframed through the client's worldview (#1) */}
        {lens ? (
          <LensHero lens={lens} celebrate={celebrate} />
        ) : (
          <div className="flex items-start gap-3">
            {matches.length === 1 && primary.affected_holding && (
              <IssuerLogo
                issuer={primary.affected_holding.issuer}
                isin={primary.affected_holding.isin}
                yahoo={primary.affected_holding.yahoo}
                size="lg"
                className="mt-0.5"
              />
            )}
            <h3 className="text-lg font-semibold leading-snug tracking-tight text-foreground">
              {primary.headline}
            </h3>
          </div>
        )}

        {/* The cited score breakdown (#2) */}
        {relevance && <RelevanceBreakdown relevance={relevance} />}

        <div className="mt-3 space-y-3">
          <AlertStory match={primary} />
          {moreStories.length > 0 ? (
            <Expander
              label="More related stories"
              count={moreStories.length}
              defaultOpen={false}
            >
              <div className="space-y-4">
                {moreStories.map((match) => (
                  <AlertStory key={match.id} match={match} />
                ))}
              </div>
            </Expander>
          ) : null}
        </div>
      </div>
    </article>
  );
}

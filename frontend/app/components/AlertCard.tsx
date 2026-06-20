"use client";

import { ChevronRight, Hash, MessageSquareQuote, Newspaper } from "lucide-react";
import type { Match, SourceType } from "@/lib/types";
import { chf, prettyDate, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { IssuerLogo } from "./IssuerLogo";
import { PolarityChip, SentimentChip, SourceBadge, Collapsible, Expander } from "./ui";
import { Provenance } from "./Provenance";
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

export function AlertCard({ matches }: { matches: Match[] }) {
  const sorted = sortMatchesByRecency(matches);
  const primary = sorted[0];
  const moreStories = sorted.slice(1);
  const grouped = matches.length > 1;
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
    <article className="card overflow-hidden">
      <div className="p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
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
        </div>

        <div className="flex items-start gap-3">
          {!grouped && primary.affected_holding && (
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

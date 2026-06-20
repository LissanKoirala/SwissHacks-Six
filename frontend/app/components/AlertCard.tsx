"use client";

import { Hash, MessageSquareQuote, Newspaper } from "lucide-react";
import type { Match, SourceType } from "@/lib/types";
import { chf, prettyDate, titleCase } from "@/lib/format";
import { IssuerLogo } from "./IssuerLogo";
import { PolarityChip, SentimentChip, SourceBadge, Expander } from "./ui";
import { Provenance } from "./Provenance";

export function AlertCard({ match }: { match: Match }) {
  const { news } = match;
  return (
    <article className="card overflow-hidden">
      <div className="p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <PolarityChip polarity={match.polarity} />
          {news.signal_type && news.signal_type !== "news" && (
            <SourceBadge type={news.signal_type as SourceType} />
          )}
          {news.topics.map((t) => (
            <span
              key={t}
              className="chip bg-muted text-muted-foreground ring-1 ring-inset ring-border"
            >
              #{t}
            </span>
          ))}
        </div>

        <div className="flex items-start gap-3">
          {match.affected_holding && (
            <IssuerLogo
              issuer={match.affected_holding.issuer}
              isin={match.affected_holding.isin}
              yahoo={match.affected_holding.yahoo}
              size="lg"
              className="mt-0.5"
            />
          )}
          <h3 className="text-lg font-semibold leading-snug tracking-tight text-foreground">
            {match.headline}
          </h3>
        </div>

        {/* news item */}
        <div className="mt-3 rounded-md bg-muted/40 p-3">
          <p className="text-sm font-medium text-foreground">{news.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">{news.source}</span>
            <span>·</span>
            <span className="font-mono tabular-nums">{prettyDate(news.published_at)}</span>
            <SentimentChip label={news.sentiment.label} />
            <span className="text-muted-foreground">
              score{" "}
              <span className="tabular-nums">
                {news.sentiment.score.toFixed(2)}
              </span>
            </span>
          </div>
          {news.body && (
            <p className="mt-2 text-sm leading-relaxed text-foreground/80">
              {news.body}
            </p>
          )}
        </div>

        {/* affected holding */}
        {match.affected_holding && (
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning ring-1 ring-inset ring-warning/20">
            <IssuerLogo
              issuer={match.affected_holding.issuer}
              isin={match.affected_holding.isin}
              yahoo={match.affected_holding.yahoo}
              size="sm"
            />
            <span className="font-medium">Affected holding</span>
            <span className="text-foreground/80">·</span>
            <span className="text-foreground/80">{match.affected_holding.issuer}</span>
            <span className="text-muted-foreground">
              ({match.affected_holding.industry_group})
            </span>
            <span className="ml-auto font-semibold tabular-nums">
              {chf(match.affected_holding.current_chf)}
            </span>
          </div>
        )}

        {/* why this surfaced — both sides cited */}
        <div className="mt-4">
          <Expander
            label="Why this surfaced"
            count={match.shared_topics.length}
            defaultOpen
          >
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
          </Expander>
        </div>
      </div>
    </article>
  );
}

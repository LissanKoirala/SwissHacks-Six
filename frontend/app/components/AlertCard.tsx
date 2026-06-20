"use client";

import type { Match } from "@/lib/types";
import { chf, prettyDate, titleCase } from "@/lib/format";
import { PolarityChip, SentimentChip, Expander } from "./ui";
import { Provenance } from "./Provenance";

export function AlertCard({ match }: { match: Match }) {
  const { news } = match;
  return (
    <article className="card overflow-hidden">
      {/* coloured rail by polarity */}
      <div
        className={
          match.polarity === "conflict"
            ? "border-l-4 border-amber-400"
            : match.polarity === "opportunity"
            ? "border-l-4 border-emerald-400"
            : "border-l-4 border-slate-300"
        }
      >
        <div className="p-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <PolarityChip polarity={match.polarity} />
            {news.topics.map((t) => (
              <span
                key={t}
                className="chip bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200"
              >
                #{t}
              </span>
            ))}
          </div>

          <h3 className="text-base font-semibold leading-snug text-ink">
            {match.headline}
          </h3>

          {/* news item */}
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-sm font-medium text-ink">{news.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="font-medium text-slate-600">{news.source}</span>
              <span>·</span>
              <span>{prettyDate(news.published_at)}</span>
              <SentimentChip label={news.sentiment.label} />
              <span className="text-slate-400">
                score {news.sentiment.score.toFixed(2)}
              </span>
            </div>
            {news.body && (
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                {news.body}
              </p>
            )}
          </div>

          {/* affected holding */}
          {match.affected_holding && (
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
              <span className="font-semibold">Affected holding:</span>
              <span>{match.affected_holding.issuer}</span>
              <span className="text-amber-700">
                ({match.affected_holding.industry_group})
              </span>
              <span className="ml-auto font-medium">
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
                    className="rounded-lg border border-slate-200 p-3"
                  >
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Shared topic · {titleCase(st.topic)}
                    </p>
                    <div className="grid gap-2 md:grid-cols-2">
                      <div>
                        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-indigo-500">
                          What the client said
                        </p>
                        <Provenance prov={st.client_provenance} />
                      </div>
                      <div>
                        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-sky-500">
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
      </div>
    </article>
  );
}

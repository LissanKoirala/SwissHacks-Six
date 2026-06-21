"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Newspaper, RefreshCw, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { NewsItem } from "@/lib/types";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const SOURCE_LABEL: Record<string, string> = {
  rss: "RSS",
  news: "Event Registry",
  sec_filing: "SEC",
  esg: "ESG",
  earnings: "Earnings",
  analyst: "Analyst",
  macro: "Macro",
};

function SentimentIcon({ s }: { s: NewsItem["sentiment"] }) {
  const label = s?.label?.toUpperCase() ?? "";
  if (label === "BULLISH") return <TrendingUp className="h-3.5 w-3.5 text-success" />;
  if (label === "BEARISH") return <TrendingDown className="h-3.5 w-3.5 text-destructive" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

function NewsCard({ item }: { item: NewsItem }) {
  const signalType = item.signal_type ?? "news";
  const sourceLabel = SOURCE_LABEL[signalType] ?? signalType;
  const isRss = signalType === "rss";

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-foreground hover:text-primary line-clamp-2 leading-snug"
            >
              {item.title}
              <ExternalLink className="inline h-3 w-3 ml-1 shrink-0 opacity-50" />
            </a>
          ) : (
            <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
              {item.title}
            </p>
          )}
        </div>
        <SentimentIcon s={item.sentiment} />
      </div>

      {item.body && (
        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
          {item.body}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] font-medium",
            isRss && "border-blue-300/40 bg-blue-50/50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
          )}
        >
          {sourceLabel}
        </Badge>
        <span className="text-[11px] text-muted-foreground">{item.source}</span>
        {item.published_at && (
          <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
            {fmtDate(item.published_at)}
          </span>
        )}
      </div>

      {item.topics.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.topics.map((t) => (
            <span
              key={t}
              className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const SIGNAL_FILTERS = [
  { id: "all", label: "All" },
  { id: "rss", label: "RSS" },
  { id: "news", label: "Event Registry" },
  { id: "sec_filing", label: "SEC" },
  { id: "macro", label: "Macro" },
  { id: "esg", label: "ESG" },
] as const;

type FilterId = (typeof SIGNAL_FILTERS)[number]["id"];

export function NewsView() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>("all");

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.news();
      // newest first
      data.sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
      setItems(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await api.ingestNews();
    } catch {
      // best-effort — load whatever is cached
    }
    await load();
  }

  const visible = filter === "all" ? items : items.filter((n) => n.signal_type === filter);
  const counts: Record<string, number> = {};
  for (const n of items) {
    const k = n.signal_type ?? "news";
    counts[k] = (counts[k] ?? 0) + 1;
  }

  return (
    <div className="h-full overflow-y-auto scroll-thin">
      <div className="mx-auto max-w-4xl px-6 py-8 space-y-6">
        {/* header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Newspaper className="h-5 w-5 text-muted-foreground" />
            <div>
              <h1 className="text-lg font-semibold text-foreground">News feed</h1>
              <p className="text-xs text-muted-foreground">
                {items.length} items — RSS feeds, Event Registry, SEC filings &amp; macro signals
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        </div>

        {/* filter pills */}
        <div className="flex flex-wrap gap-2">
          {SIGNAL_FILTERS.map((f) => {
            const count = f.id === "all" ? items.length : (counts[f.id] ?? 0);
            if (f.id !== "all" && count === 0) return null;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors",
                  filter === f.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                )}
              >
                {f.label}
                {count > 0 && (
                  <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* body */}
        {loading ? (
          <div className="grid h-48 place-items-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : error ? (
          <div className="card p-5 text-sm text-destructive">{error}</div>
        ) : visible.length === 0 ? (
          <div className="card p-8 text-center text-sm text-muted-foreground">
            {items.length === 0
              ? "No news items yet. Set USE_LIVE=1 in your .env and click Refresh to pull live feeds."
              : "No items match this filter."}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {visible.map((n) => (
              <NewsCard key={n.id} item={n} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

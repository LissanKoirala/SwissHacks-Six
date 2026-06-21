"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Newspaper, RefreshCw, Loader2 } from "lucide-react";
import type { NewsItem } from "@/lib/types";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { prettyDate, titleCase } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PublisherLogo } from "./PublisherLogo";
import { LinkPreviewThumb } from "./LinkPreviewThumb";
import { ProvenanceTag } from "./Provenance";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PREVIEW_COUNT = 20;

const SIGNAL_FILTERS = [
  { id: "all", label: "All" },
  { id: "rss", label: "RSS" },
  { id: "news", label: "Event Registry" },
  { id: "sec_filing", label: "SEC" },
  { id: "macro", label: "Macro" },
  { id: "esg", label: "ESG" },
] as const;

type FilterId = (typeof SIGNAL_FILTERS)[number]["id"];

function newsUrl(n: NewsItem): string | null {
  return n.url ?? n.provenance?.url ?? null;
}

function NewsRow({ n }: { n: NewsItem }) {
  const score = n.sentiment?.score ?? 0;
  const label = n.sentiment?.label ?? "NEUTRAL";
  const up = score > 0.05;
  const down = score < -0.05;
  const articleUrl = newsUrl(n);

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-stretch">
        <div className="min-w-0 p-3">
          <div className="flex items-center gap-2">
            <PublisherLogo articleUrl={articleUrl} source={n.source} />
            <span className="text-[11px] font-medium text-muted-foreground">{n.source}</span>
            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
              {prettyDate(n.published_at)}
            </span>
          </div>
          {articleUrl ? (
            <a href={articleUrl} target="_blank" rel="noreferrer" className="group">
              <p className="mt-1 line-clamp-2 min-h-10 text-sm font-medium leading-snug text-ink group-hover:text-primary">
                {n.title}
              </p>
            </a>
          ) : (
            <p className="mt-1 line-clamp-2 min-h-10 text-sm font-medium leading-snug text-ink">
              {n.title}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className={`chip ring-1 ring-inset ${
                up
                  ? "bg-success/10 text-success ring-success/20"
                  : down
                  ? "bg-destructive/10 text-destructive ring-destructive/20"
                  : "bg-muted text-muted-foreground ring-border"
              }`}
            >
              {label} {score >= 0 ? "+" : ""}
              {score.toFixed(2)}
            </span>
            {n.topics.map((t) => (
              <span key={t} className="chip bg-muted text-muted-foreground ring-1 ring-inset ring-border">
                {titleCase(t)}
              </span>
            ))}
            <ProvenanceTag prov={n.provenance} label="source" />
          </div>
        </div>
        {articleUrl ? (
          <LinkPreviewThumb
            url={articleUrl}
            layout="thumbnail-stretch"
            className="!h-full !min-h-0 !w-auto self-stretch rounded-none rounded-r-md ring-0"
          />
        ) : null}
      </div>
    </div>
  );
}

function NewsSkeleton() {
  return (
    <div className="card p-4 animate-pulse space-y-2.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-stretch">
            <div className="space-y-2 p-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 shrink-0 rounded-lg bg-muted" />
                <div className="h-3 w-16 rounded bg-muted" />
                <div className="ml-auto h-3 w-12 rounded bg-muted" />
              </div>
              <div className="h-3 w-5/6 rounded bg-muted" />
              <div className="h-3 w-3/4 rounded bg-muted" />
              <div className="flex gap-2">
                <div className="h-5 w-14 rounded-full bg-muted" />
                <div className="h-5 w-16 rounded-full bg-muted" />
              </div>
            </div>
            <div className="aspect-video h-full min-h-[5rem] w-auto shrink-0 self-stretch border-l border-border/50 bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function NewsView() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>("all");
  const [allOpen, setAllOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      try {
        await api.refreshLiveNews();
      } catch {
        // best-effort
      }
      const data = await api.news();
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
    await load();
  }

  const visible = filter === "all" ? items : items.filter((n) => n.signal_type === filter);
  const counts: Record<string, number> = {};
  for (const n of items) {
    const k = n.signal_type ?? "news";
    counts[k] = (counts[k] ?? 0) + 1;
  }
  const preview = visible.slice(0, PREVIEW_COUNT);
  const hasMore = visible.length > PREVIEW_COUNT;

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-8 py-6 space-y-5">
        {/* header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Newspaper className="h-5 w-5 text-muted-foreground" />
            <div>
              <h1 className="font-display text-2xl font-light tracking-tight text-ink">
                News feed
              </h1>
              <p className="text-xs text-muted-foreground">
                {items.length} items · RSS, Event Registry, SEC filings &amp; macro signals
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
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
                    : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
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
          <NewsSkeleton />
        ) : error ? (
          <div className="card p-5 text-sm text-destructive">{error}</div>
        ) : visible.length === 0 ? (
          <div className="card p-8 text-center text-sm text-muted-foreground">
            {items.length === 0
              ? "No news items yet. Set USE_LIVE=1 in your .env and click Refresh to pull live feeds."
              : "No items match this filter."}
          </div>
        ) : (
          <div className="card p-4">
            <div className="space-y-2.5">
              {preview.map((n) => (
                <NewsRow key={n.id} n={n} />
              ))}
            </div>
            {hasMore && (
              <button
                type="button"
                onClick={() => setAllOpen(true)}
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Show all {visible.length} stories
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>

      <Dialog open={allOpen} onOpenChange={setAllOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl gap-4 overflow-y-auto">
          <DialogHeader>
            <DialogTitle>News feed</DialogTitle>
            <DialogDescription>
              {visible.length} stor{visible.length !== 1 ? "ies" : "y"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5">
            {visible.map((n) => (
              <NewsRow key={n.id} n={n} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { Polarity, SourceType } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------- chips --- */

const POLARITY_META: Record<
  Polarity,
  { label: string; cls: string; dot: string }
> = {
  conflict: {
    label: "Conflict",
    cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20",
    dot: "bg-amber-500",
  },
  opportunity: {
    label: "Opportunity",
    cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20",
    dot: "bg-emerald-500",
  },
  neutral: {
    label: "Neutral",
    cls: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
    dot: "bg-muted-foreground/60",
  },
};

export function PolarityChip({ polarity }: { polarity: Polarity }) {
  const m = POLARITY_META[polarity] ?? POLARITY_META.neutral;
  return (
    <span className={cn("chip", m.cls)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

export function SentimentChip({ label }: { label: string }) {
  const up = /BULL|POSITIVE|POS/i.test(label);
  const down = /BEAR|NEGATIVE|NEG/i.test(label);
  const cls = up
    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20"
    : down
    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20"
    : "bg-muted text-muted-foreground ring-border";
  return (
    <span className={cn("chip ring-1 ring-inset", cls)}>Sentiment · {label}</span>
  );
}

const SOURCE_META: Record<SourceType, { label: string; cls: string }> = {
  crm_log: {
    label: "CRM log",
    cls: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-indigo-500/20",
  },
  news: {
    label: "News",
    cls: "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-sky-500/20",
  },
  cio_list: {
    label: "CIO list",
    cls: "bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-violet-500/20",
  },
  portfolio: {
    label: "Portfolio",
    cls: "bg-teal-500/10 text-teal-600 dark:text-teal-400 ring-teal-500/20",
  },
  mandate: {
    label: "Mandate",
    cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20",
  },
  market_digest: {
    label: "Market digest",
    cls: "bg-muted text-muted-foreground ring-border",
  },
};

export function SourceBadge({ type }: { type: SourceType }) {
  const m = SOURCE_META[type] ?? {
    label: type,
    cls: "bg-muted text-muted-foreground ring-border",
  };
  return <span className={cn("chip ring-1 ring-inset", m.cls)}>{m.label}</span>;
}

/* ------------------------------------------------------------ expander --- */

export function Expander({
  label,
  count,
  children,
  defaultOpen = false,
}: {
  label: string;
  count?: number;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80"
        aria-expanded={open}
      >
        <ChevronRight
          className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")}
        />
        {label}
        {typeof count === "number" && (
          <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
            {count}
          </span>
        )}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function MandatePill({ mandate }: { mandate: string }) {
  return (
    <Badge
      variant="secondary"
      className="rounded-full font-medium text-muted-foreground"
    >
      {mandate}
    </Badge>
  );
}

"use client";

import { useState, type ReactNode } from "react";
import {
  ChevronRight,
  NotebookPen,
  Newspaper,
  ClipboardList,
  Wallet,
  Scale,
  Globe,
  FileText,
  Leaf,
  BarChart3,
  LineChart,
  TrendingUp,
  Calculator,
  UserRoundCog,
  type LucideIcon,
} from "lucide-react";
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
    cls: "bg-warning/10 text-warning ring-1 ring-inset ring-warning/20",
    dot: "bg-warning",
  },
  opportunity: {
    label: "Opportunity",
    cls: "bg-success/10 text-success ring-1 ring-inset ring-success/20",
    dot: "bg-success",
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
    ? "bg-success/10 text-success ring-success/20"
    : down
    ? "bg-destructive/10 text-destructive ring-destructive/20"
    : "bg-muted text-muted-foreground ring-border";
  return (
    <span className={cn("chip ring-1 ring-inset", cls)}>Sentiment · {label}</span>
  );
}

// One restrained chip style for every source type; the Lucide icon carries the
// distinction (not a rainbow of hues). Keeps provenance scannable on-token.
const SOURCE_META: Record<SourceType, { label: string; icon: LucideIcon }> = {
  crm_log: { label: "CRM log", icon: NotebookPen },
  news: { label: "News", icon: Newspaper },
  cio_list: { label: "CIO list", icon: ClipboardList },
  portfolio: { label: "Portfolio", icon: Wallet },
  mandate: { label: "Mandate", icon: Scale },
  market_digest: { label: "Market digest", icon: Globe },
  // additional free data sources (CLAUDE.md §6)
  sec_filing: { label: "SEC filing", icon: FileText },
  esg: { label: "ESG", icon: Leaf },
  earnings: { label: "Earnings", icon: BarChart3 },
  analyst: { label: "Analyst", icon: LineChart },
  macro: { label: "Macro/FX", icon: TrendingUp },
  fundamentals: { label: "Fundamentals", icon: Calculator },
  insider: { label: "Insider", icon: UserRoundCog },
};

export function SourceBadge({ type }: { type: SourceType }) {
  const m = SOURCE_META[type];
  const Icon = m?.icon;
  return (
    <span className="chip bg-muted text-muted-foreground ring-1 ring-inset ring-border">
      {Icon && <Icon className="h-3 w-3" aria-hidden />}
      {m?.label ?? type}
    </span>
  );
}

/* ------------------------------------------------------------ expander --- */

export function Expander({
  label,
  count,
  summary,
  children,
  defaultOpen = false,
}: {
  label: string;
  count?: number;
  /** Optional one-line peek shown after the label while collapsed, so the RM
   *  knows what is inside before opening (e.g. "CRM, News, CIO"). */
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        // Neutral by default; blue only on hover/open so the "one thing to click"
        // signal isn't diluted across every disclosure on a dense screen.
        className={cn(
          "flex max-w-full items-center gap-2 text-sm font-medium transition-colors",
          open ? "text-primary" : "text-muted-foreground hover:text-primary"
        )}
        aria-expanded={open}
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform",
            open && "rotate-90"
          )}
        />
        <span className="shrink-0">{label}</span>
        {typeof count === "number" && (
          <span className="shrink-0 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
            {count}
          </span>
        )}
        {summary != null && !open && (
          <span className="truncate text-xs font-normal text-muted-foreground">
            · {summary}
          </span>
        )}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------- figure tile --- */

/**
 * A compact KPI tile — the workbench's glance primitive. Label-first stacking,
 * a flat surface step and a hairline ring. `tone` carries finance meaning only
 * (amber = needs attention, red = loss, green = gain); default is neutral ink.
 * Shared by the Analytics KPI strip, the client header band, and the Home book band.
 */
export function FigureCard({
  label,
  value,
  tone = "ink",
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: "ink" | "amber" | "green" | "red";
  hint?: ReactNode;
}) {
  const toneCls =
    tone === "amber"
      ? "text-warning"
      : tone === "green"
      ? "text-positive"
      : tone === "red"
      ? "text-negative"
      : "text-foreground";
  return (
    <div className="rounded-md bg-surface-2 px-3.5 py-3 ring-1 ring-inset ring-border/70">
      <p className="truncate text-[11px] font-medium tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold leading-none tabular-nums",
          toneCls
        )}
      >
        {value}
      </p>
      {hint != null && (
        <p className="mt-1 truncate text-[11px] text-muted-foreground">{hint}</p>
      )}
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

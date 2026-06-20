"use client";

import { useState, type ReactNode } from "react";
import type { Polarity, SourceType } from "@/lib/types";

/* ---------------------------------------------------------------- chips --- */

export function PolarityChip({ polarity }: { polarity: Polarity }) {
  const map: Record<Polarity, { label: string; cls: string }> = {
    conflict: {
      label: "Conflict",
      cls: "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200",
    },
    opportunity: {
      label: "Opportunity",
      cls: "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200",
    },
    neutral: {
      label: "Neutral",
      cls: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200",
    },
  };
  const m = map[polarity] ?? map.neutral;
  return (
    <span className={`chip ${m.cls}`}>
      <Dot polarity={polarity} />
      {m.label}
    </span>
  );
}

function Dot({ polarity }: { polarity: Polarity }) {
  const color =
    polarity === "conflict"
      ? "bg-amber-500"
      : polarity === "opportunity"
      ? "bg-emerald-500"
      : "bg-slate-400";
  return <span className={`h-1.5 w-1.5 rounded-full ${color}`} />;
}

export function SentimentChip({ label }: { label: string }) {
  const up = /BULL|POSITIVE|POS/i.test(label);
  const down = /BEAR|NEGATIVE|NEG/i.test(label);
  const cls = up
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : down
    ? "bg-rose-50 text-rose-700 ring-rose-200"
    : "bg-slate-50 text-slate-600 ring-slate-200";
  return (
    <span className={`chip ring-1 ring-inset ${cls}`}>
      Sentiment · {label}
    </span>
  );
}

const SOURCE_META: Record<
  SourceType,
  { label: string; cls: string }
> = {
  crm_log: {
    label: "CRM log",
    cls: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  },
  news: { label: "News", cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  cio_list: {
    label: "CIO list",
    cls: "bg-violet-50 text-violet-700 ring-violet-200",
  },
  portfolio: {
    label: "Portfolio",
    cls: "bg-teal-50 text-teal-700 ring-teal-200",
  },
  mandate: {
    label: "Mandate",
    cls: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  market_digest: {
    label: "Market digest",
    cls: "bg-slate-100 text-slate-600 ring-slate-200",
  },
  // additional free data sources (CLAUDE.md §6)
  sec_filing: {
    label: "SEC filing",
    cls: "bg-blue-50 text-blue-700 ring-blue-200",
  },
  esg: { label: "ESG", cls: "bg-green-50 text-green-700 ring-green-200" },
  earnings: {
    label: "Earnings",
    cls: "bg-orange-50 text-orange-700 ring-orange-200",
  },
  analyst: {
    label: "Analyst",
    cls: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
  },
  macro: { label: "Macro/FX", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
  fundamentals: {
    label: "Fundamentals",
    cls: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  },
  insider: {
    label: "Insider",
    cls: "bg-rose-50 text-rose-700 ring-rose-200",
  },
};

export function SourceBadge({ type }: { type: SourceType }) {
  const m = SOURCE_META[type] ?? {
    label: type,
    cls: "bg-slate-100 text-slate-600 ring-slate-200",
  };
  return <span className={`chip ring-1 ring-inset ${m.cls}`}>{m.label}</span>;
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
        className="flex items-center gap-2 text-sm font-medium text-accent hover:text-accent-ink"
        aria-expanded={open}
      >
        <Caret open={open} />
        {label}
        {typeof count === "number" && (
          <span className="rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">
            {count}
          </span>
        )}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`}
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
    >
      <path
        d="M4 2.5 8 6l-4 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MandatePill({ mandate }: { mandate: string }) {
  return (
    <span className="chip bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">
      {mandate}
    </span>
  );
}

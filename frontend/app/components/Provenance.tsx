"use client";

import { useState } from "react";
import type { Provenance as Prov } from "@/lib/types";
import { prettyDate } from "@/lib/format";
import { SourceBadge } from "./ui";

/**
 * The trust primitive. Renders a coloured source-type badge plus the cited
 * excerpt, with the source id, timestamp and an optional outbound link.
 * Used everywhere a citation appears (CLAUDE.md §7.5, trust & explainability).
 */
export function Provenance({ prov }: { prov: Prov }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <SourceBadge type={prov.source_type} />
        <span className="font-mono text-[11px] text-slate-400">
          {prov.source_id}
        </span>
        {prov.timestamp && (
          <span className="ml-auto text-[11px] text-slate-400">
            {prettyDate(prov.timestamp)}
          </span>
        )}
      </div>
      <p className="text-sm leading-relaxed text-ink-soft">
        “{prov.excerpt}”
      </p>
      {prov.url && (
        <a
          href={prov.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          View source
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M4.5 2.5h5v5M9.5 2.5 3 9"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      )}
    </div>
  );
}

export function ProvenanceList({ items }: { items: Prov[] }) {
  return (
    <div className="space-y-2">
      {items.map((p, i) => (
        <Provenance key={`${p.source_id}-${i}`} prov={p} />
      ))}
    </div>
  );
}

/**
 * Inline citation marker: a small "source" tag that reveals one provenance
 * record on click. Used after talking points and market-context footnotes.
 */
export function ProvenanceTag({
  prov,
  label = "source",
}: {
  prov: Prov;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block align-baseline">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 ring-1 ring-inset ring-slate-200 hover:bg-slate-200"
        aria-expanded={open}
      >
        {label}
      </button>
      {open && (
        <span className="absolute left-0 top-full z-20 mt-1 block w-80 max-w-[80vw] rounded-lg border border-slate-200 bg-white p-1 shadow-pop">
          <Provenance prov={prov} />
        </span>
      )}
    </span>
  );
}

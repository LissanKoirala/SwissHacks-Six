"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Provenance as Prov } from "@/lib/types";
import { prettyDate } from "@/lib/format";
import { SourceBadge } from "./ui";
import { LinkPreviewThumb } from "./LinkPreviewThumb";

/**
 * The trust primitive. Renders a coloured source-type badge plus the cited
 * excerpt, with the source id, timestamp and an optional outbound link.
 * Used everywhere a citation appears (CLAUDE.md §7.5, trust & explainability).
 */
export function Provenance({
  prov,
  showPreview = false,
}: {
  prov: Prov;
  showPreview?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex gap-3">
        {showPreview && prov.url ? (
          <LinkPreviewThumb url={prov.url} size="sm" />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <SourceBadge type={prov.source_type} />
            <span className="citation font-mono text-[11px]">
              {prov.source_id}
            </span>
            {prov.timestamp && (
              <span className="ml-auto text-[11px] text-muted-foreground">
                {prettyDate(prov.timestamp)}
              </span>
            )}
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            “{prov.excerpt}”
          </p>
          {prov.url && (
            <a
              href={prov.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
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
      </div>
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
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Render the popover in a portal at fixed coordinates so it escapes the
  // overflow/scroll containers of dense tables (where it used to get clipped),
  // and dismiss it on Escape, outside-click, scroll or resize. Provenance is
  // 25% of the score — it must never be cut off.
  useEffect(() => {
    if (!open) return;
    const PANEL_W = 320;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - PANEL_W - 8));
      setPos({ top: r.bottom + 6, left });
    };
    place();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="citation ml-1 font-mono text-[11px] ring-1 ring-inset ring-primary/20 transition-colors hover:bg-primary/15"
        aria-expanded={open}
      >
        {label}
      </button>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            className="fixed z-50 w-80 max-w-[calc(100vw-1rem)] rounded-lg border border-border bg-popover p-1 shadow-pop dark:shadow-none"
            style={{ top: pos.top, left: pos.left }}
          >
            <Provenance prov={prov} />
          </div>,
          document.body
        )}
    </>
  );
}

"use client";

// Staged-review subtree for RM Capture (CAPTURE_CONTRACT §3.2). Renders the
// read-only draft returned by /capture/extract: the golden-rule banner, the
// normalised note, the risk-timeline preview, detected-topic chips, and the
// editable proposed interest edges + profile statements behind the RM confirm
// gate. All edits are immutable patches lifted up to CaptureNote.
// Light + dark via semantic tokens + shadcn primitives.

import type {
  CaptureDraft,
  ProposedEdge,
  ProposedFacet,
  RiskPreview,
  Polarity,
} from "@/lib/types";
import { prettyDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* --------------------------------------------------------------- consts --- */

const POLARITIES: Polarity[] = ["opportunity", "conflict", "neutral"];
const FACETS = ["professional", "interests", "historical", "personality"] as const;

const MINI_SELECT = "h-7 w-auto gap-1 px-2 py-1 text-xs";
const ROW = "rounded-lg border p-3 transition-colors";
const CHECKBOX =
  "mt-1 h-4 w-4 shrink-0 rounded border-border bg-transparent text-primary focus:ring-primary/30 accent-primary";

// Direction → colour, matching the Risk Timeline lexicon.
const DIR_HEX: Record<RiskPreview["direction"], string> = {
  up: "#10b981",
  down: "#f43f5e",
  flat: "#94a3b8",
};
const DIR_META: Record<
  RiskPreview["direction"],
  { label: string; arrow: string; cls: string }
> = {
  up: {
    label: "risk-on",
    arrow: "▲",
    cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
  },
  down: {
    label: "de-risk",
    arrow: "▼",
    cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20",
  },
  flat: {
    label: "flat",
    arrow: "■",
    cls: "bg-muted text-muted-foreground ring-border",
  },
};
const POL_TINT: Record<Polarity, string> = {
  opportunity: "text-emerald-600 dark:text-emerald-400",
  conflict: "text-amber-600 dark:text-amber-400",
  neutral: "text-muted-foreground",
};

function titleCaseFacet(f: string): string {
  return f.charAt(0).toUpperCase() + f.slice(1);
}

// Map a thrown fetch error to a friendly, RM-readable message (422 / 404 / net).
export function extractErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("422")) {
    return "The note was rejected (empty or too long). Add some text and try again.";
  }
  if (raw.includes("404")) {
    return "Unknown client — could not reach the capture endpoint.";
  }
  if (/Failed to fetch|NetworkError/i.test(raw)) {
    return "Could not reach the backend. Is the API running on :8000?";
  }
  return raw;
}

/* ------------------------------------------------------------ small bits --- */

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="chip bg-muted text-muted-foreground ring-1 ring-inset ring-border">
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function FacetSelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn(MINI_SELECT, className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {FACETS.map((f) => (
          <SelectItem key={f} value={f}>
            {titleCaseFacet(f)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* -------------------------------------------------------- risk preview --- */

function RiskPreviewBadge({ risk }: { risk: RiskPreview }) {
  const meta = DIR_META[risk.direction] ?? DIR_META.flat;
  const sign = risk.delta > 0 ? "+" : "";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={cn("chip ring-1 ring-inset", meta.cls)}>
        <span className="text-[9px] leading-none">{meta.arrow}</span>
        Risk {meta.label}
        <span className="tabular-nums opacity-80">
          {sign}
          {risk.delta.toFixed(3)}
        </span>
      </span>
      {risk.signals.map((s, i) => (
        <span
          key={`${s.term}-${i}`}
          className="chip bg-card text-muted-foreground ring-1 ring-inset ring-border"
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: DIR_HEX[s.direction] }}
          />
          {s.term}
        </span>
      ))}
      {risk.signals.length === 0 && (
        <span className="text-xs text-muted-foreground">
          no risk-lexicon terms detected
        </span>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- edge / facet --- */

function EdgeRow({
  edge,
  index,
  patch,
}: {
  edge: ProposedEdge;
  index: number;
  patch: (i: number, p: Partial<ProposedEdge>) => void;
}) {
  return (
    <div
      className={cn(
        ROW,
        edge.selected
          ? "border-border bg-card"
          : "border-border bg-muted/40 opacity-70"
      )}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={edge.selected}
          onChange={(e) => patch(index, { selected: e.target.checked })}
          className={CHECKBOX}
          aria-label={`Keep ${edge.topic_label} edge`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {edge.topic_label}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {edge.topic}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Polarity
              <Select
                value={edge.polarity}
                onValueChange={(v) =>
                  patch(index, { polarity: v as Polarity })
                }
              >
                <SelectTrigger
                  className={cn(
                    MINI_SELECT,
                    "font-medium",
                    POL_TINT[edge.polarity]
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POLARITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Facet
              <FacetSelect value={edge.facet} onChange={(v) => patch(index, { facet: v })} />
            </label>
          </div>
          {edge.rationale && (
            <p className="mt-2 text-xs italic leading-relaxed text-muted-foreground">
              {edge.rationale}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function FacetRow({
  facet,
  index,
  patch,
}: {
  facet: ProposedFacet;
  index: number;
  patch: (i: number, p: Partial<ProposedFacet>) => void;
}) {
  return (
    <div
      className={cn(
        ROW,
        facet.selected
          ? "border-border bg-card"
          : "border-border bg-muted/40 opacity-70"
      )}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={facet.selected}
          onChange={(e) => patch(index, { selected: e.target.checked })}
          className={CHECKBOX}
          aria-label="Keep this profile statement"
        />
        <div className="min-w-0 flex-1">
          <label className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            Facet
            <FacetSelect value={facet.facet} onChange={(v) => patch(index, { facet: v })} />
          </label>
          <Textarea
            value={facet.text}
            onChange={(e) => patch(index, { text: e.target.value })}
            rows={2}
            className="min-h-0 resize-y text-sm leading-relaxed"
          />
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- the panel --- */

export interface StagedPanelProps {
  draft: CaptureDraft;
  edges: ProposedEdge[];
  facets: ProposedFacet[];
  patchEdge: (i: number, p: Partial<ProposedEdge>) => void;
  patchFacet: (i: number, p: Partial<ProposedFacet>) => void;
  selectedEdgeCount: number;
  selectedFacetCount: number;
  confirming: boolean;
  error: string | null;
  onConfirm: () => void;
  onDiscard: () => void;
}

export function StagedPanel({
  draft,
  edges,
  facets,
  patchEdge,
  patchFacet,
  selectedEdgeCount,
  selectedFacetCount,
  confirming,
  error,
  onConfirm,
  onDiscard,
}: StagedPanelProps) {
  return (
    <section className="card overflow-hidden">
      {/* golden-rule banner */}
      <div className="flex items-start gap-2.5 border-b border-amber-500/20 bg-amber-500/10 px-5 py-3">
        <span
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-600 dark:text-amber-400"
          aria-hidden
        >
          !
        </span>
        <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
          Nothing is saved yet — review the draft below, edit or deselect anything,
          then confirm to append it.
        </p>
      </div>

      <div className="space-y-5 p-5">
        {/* header: modality + dates + preview id */}
        <div className="flex flex-wrap items-center gap-2">
          <MetaChip>
            <span aria-hidden>{draft.modality_icon}</span>
            {draft.modality}
          </MetaChip>
          <MetaChip>{prettyDate(draft.date)}</MetaChip>
          {draft.contact && <MetaChip>{draft.contact}</MetaChip>}
          {draft.rm_name && <MetaChip>RM · {draft.rm_name}</MetaChip>}
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            will be {draft.preview_entry_id}
          </span>
        </div>

        {/* normalised note */}
        <div>
          <SectionLabel>Note (normalised)</SectionLabel>
          <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm leading-relaxed text-foreground/80">
            {draft.note}
          </p>
        </div>

        {/* risk preview */}
        <div>
          <SectionLabel>Risk-timeline preview</SectionLabel>
          <RiskPreviewBadge risk={draft.risk_preview} />
        </div>

        {/* detected topics */}
        <div>
          <SectionLabel>Detected topics</SectionLabel>
          {draft.detected_topics.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {draft.detected_topics.map((t) => (
                <span
                  key={t.topic}
                  className="chip bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
                  title={t.topic}
                >
                  {t.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No known topics matched — the note will still be logged.
            </p>
          )}
        </div>

        {/* proposed interest edges */}
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Proposed interest edges
            </p>
            <span className="text-[11px] text-muted-foreground">
              {selectedEdgeCount} of {edges.length} kept
            </span>
          </div>
          {edges.length > 0 ? (
            <div className="space-y-2">
              {edges.map((e, i) => (
                <EdgeRow key={`${e.topic}-${i}`} edge={e} index={i} patch={patchEdge} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No interest edges proposed.</p>
          )}
        </div>

        {/* proposed facet statements */}
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Proposed profile statements
            </p>
            <span className="text-[11px] text-muted-foreground">
              {selectedFacetCount} of {facets.length} kept
            </span>
          </div>
          {facets.length > 0 ? (
            <div className="space-y-2">
              {facets.map((f, i) => (
                <FacetRow key={i} facet={f} index={i} patch={patchFacet} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No profile statements proposed.</p>
          )}
        </div>

        {error && (
          <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}

        {/* confirm gate */}
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button type="button" onClick={onConfirm} disabled={confirming}>
            {confirming ? (
              <>
                <span
                  className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                  aria-hidden
                />
                Appending…
              </>
            ) : (
              "Confirm & append"
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onDiscard}
            disabled={confirming}
          >
            Discard draft
          </Button>
          <span className="text-xs text-muted-foreground">
            Will apply {selectedEdgeCount} edge{selectedEdgeCount === 1 ? "" : "s"} and{" "}
            {selectedFacetCount} statement{selectedFacetCount === 1 ? "" : "s"}, then log
            the note immutably.
          </span>
        </div>
      </div>
    </section>
  );
}

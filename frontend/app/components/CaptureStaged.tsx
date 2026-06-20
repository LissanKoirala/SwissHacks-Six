"use client";

// Staged-review subtree for RM Capture (CAPTURE_CONTRACT §3.2). Renders the
// read-only draft returned by /capture/extract: the golden-rule banner, the
// normalised note, the risk-timeline preview, detected-topic chips, and the
// editable proposed interest edges + profile statements behind the RM confirm
// gate. All edits are immutable patches lifted up to CaptureNote. Light theme.

import type {
  CaptureDraft,
  ProposedEdge,
  ProposedFacet,
  RiskPreview,
  Polarity,
} from "@/lib/types";
import { prettyDate } from "@/lib/format";

/* --------------------------------------------------------------- consts --- */

const POLARITIES: Polarity[] = ["opportunity", "conflict", "neutral"];
const FACETS = ["professional", "interests", "historical", "personality"] as const;

const MINI_SELECT =
  "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary/20";
const ROW = "rounded-lg border p-3 transition-colors";
const CHECKBOX =
  "mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-primary focus:ring-primary/30";

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
  up: { label: "risk-on", arrow: "▲", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  down: { label: "de-risk", arrow: "▼", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
  flat: { label: "flat", arrow: "■", cls: "bg-slate-50 text-slate-600 ring-slate-200" },
};
const POL_TINT: Record<Polarity, string> = {
  opportunity: "text-emerald-700",
  conflict: "text-amber-700",
  neutral: "text-slate-600",
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
    <span className="chip bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </p>
  );
}

function FacetSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={MINI_SELECT}
    >
      {FACETS.map((f) => (
        <option key={f} value={f}>
          {titleCaseFacet(f)}
        </option>
      ))}
    </select>
  );
}

/* -------------------------------------------------------- risk preview --- */

function RiskPreviewBadge({ risk }: { risk: RiskPreview }) {
  const meta = DIR_META[risk.direction] ?? DIR_META.flat;
  const sign = risk.delta > 0 ? "+" : "";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`chip ring-1 ring-inset ${meta.cls}`}>
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
          className="chip bg-white text-slate-600 ring-1 ring-inset ring-slate-200"
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: DIR_HEX[s.direction] }}
          />
          {s.term}
        </span>
      ))}
      {risk.signals.length === 0 && (
        <span className="text-xs text-slate-400">
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
      className={`${ROW} ${
        edge.selected ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50/60 opacity-70"
      }`}
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
            <span className="text-sm font-semibold text-ink">{edge.topic_label}</span>
            <span className="font-mono text-[11px] text-slate-400">{edge.topic}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              Polarity
              <select
                value={edge.polarity}
                onChange={(e) => patch(index, { polarity: e.target.value as Polarity })}
                className={`${MINI_SELECT} font-medium ${POL_TINT[edge.polarity]}`}
              >
                {POLARITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              Facet
              <FacetSelect value={edge.facet} onChange={(v) => patch(index, { facet: v })} />
            </label>
          </div>
          {edge.rationale && (
            <p className="mt-2 text-xs italic leading-relaxed text-slate-500">
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
      className={`${ROW} ${
        facet.selected ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50/60 opacity-70"
      }`}
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
          <label className="mb-1 flex items-center gap-1.5 text-xs text-slate-500">
            Facet
            <FacetSelect value={facet.facet} onChange={(v) => patch(index, { facet: v })} />
          </label>
          <textarea
            value={facet.text}
            onChange={(e) => patch(index, { text: e.target.value })}
            rows={2}
            className="w-full resize-y rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm leading-relaxed text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
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
      <div className="flex items-start gap-2.5 border-b border-amber-200 bg-amber-50 px-5 py-3">
        <span
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-[11px] font-bold text-amber-800"
          aria-hidden
        >
          !
        </span>
        <p className="text-sm font-medium text-amber-800">
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
          <span className="ml-auto font-mono text-[11px] text-slate-400">
            will be {draft.preview_entry_id}
          </span>
        </div>

        {/* normalised note */}
        <div>
          <SectionLabel>Note (normalised)</SectionLabel>
          <p className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-sm leading-relaxed text-ink-soft">
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
            <p className="text-xs text-slate-400">
              No known topics matched — the note will still be logged.
            </p>
          )}
        </div>

        {/* proposed interest edges */}
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Proposed interest edges
            </p>
            <span className="text-[11px] text-slate-400">
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
            <p className="text-xs text-slate-400">No interest edges proposed.</p>
          )}
        </div>

        {/* proposed facet statements */}
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Proposed profile statements
            </p>
            <span className="text-[11px] text-slate-400">
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
            <p className="text-xs text-slate-400">No profile statements proposed.</p>
          )}
        </div>

        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        {/* confirm gate */}
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
          <button
            type="button"
            className="btn-primary"
            onClick={onConfirm}
            disabled={confirming}
          >
            {confirming ? (
              <>
                <span
                  className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  aria-hidden
                />
                Appending…
              </>
            ) : (
              "Confirm & append"
            )}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={onDiscard}
            disabled={confirming}
          >
            Discard draft
          </button>
          <span className="text-xs text-slate-500">
            Will apply {selectedEdgeCount} edge{selectedEdgeCount === 1 ? "" : "s"} and{" "}
            {selectedFacetCount} statement{selectedFacetCount === 1 ? "" : "s"}, then log
            the note immutably.
          </span>
        </div>
      </div>
    </section>
  );
}

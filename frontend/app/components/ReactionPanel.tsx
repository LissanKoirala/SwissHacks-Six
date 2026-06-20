"use client";

import {
  Lightbulb,
  MessageSquareWarning,
  ShieldAlert,
  UserRoundSearch,
} from "lucide-react";
import type { ReactionPrediction } from "@/lib/types";
import { ProvenanceTag } from "./Provenance";

/**
 * The Reaction Simulator (#3): a forecast of how THIS client will react to the proposal, predicted
 * from their personality + their own past words, so the RM walks in prepared. Advisory only — it
 * prepares the RM and never speaks to or for the client (CLAUDE.md §2); the guardrail says so.
 */
export function ReactionPanel({
  reaction,
}: {
  reaction: ReactionPrediction | null;
}) {
  if (!reaction) return null;
  return (
    <section className="card flex flex-col">
      <header className="border-b border-border px-5 py-4">
        <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground">
          <UserRoundSearch className="h-3.5 w-3.5" />
          Predicted Client Reaction
        </p>
        <h2 className="mt-1 text-base font-semibold leading-snug tracking-tight text-foreground">
          How this client is likely to react — so you walk in prepared.
        </h2>
      </header>

      <div className="flex-1 space-y-5 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
            {reaction.emotional_register}
          </span>
          <span
            className="chip bg-muted text-muted-foreground ring-1 ring-inset ring-border"
            title={
              reaction.confidence === "grounded"
                ? "Anchored to the client's own documented words"
                : "Inferred from the client's style; no direct quote on file"
            }
          >
            {reaction.confidence === "grounded"
              ? "Grounded in their words"
              : "Inferred"}
          </span>
          <span
            className="ml-auto rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-border"
            title={
              reaction.draft_source === "llm"
                ? "Predicted by the language model from the client's DNA"
                : "Deterministic forecast from the client's documented style (no model call)"
            }
          >
            {reaction.draft_source === "llm" ? "AI-predicted" : "Heuristic"}
          </span>
        </div>

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground">
            <MessageSquareWarning className="h-3.5 w-3.5" />
            Likely objection
          </p>
          <blockquote className="rounded-md bg-muted/40 px-4 py-3 text-sm italic leading-relaxed text-foreground/80">
            {reaction.predicted_objection}
          </blockquote>
          {/* the prediction is a claim about the client — cite what it is grounded in (§2) */}
          {reaction.provenance.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Grounded in</span>
              {reaction.provenance.map((p, i) => (
                <ProvenanceTag
                  key={`${p.source_id}-${i}`}
                  prov={p}
                  label={p.source_type === "crm_log" ? "their words" : "source"}
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground">
            <Lightbulb className="h-3.5 w-3.5" />
            How to meet it
          </p>
          <p className="text-sm leading-relaxed text-foreground/80">
            {reaction.suggested_rebuttal}
          </p>
        </div>
      </div>

      <footer className="border-t border-border px-5 py-4">
        <div className="flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning ring-1 ring-inset ring-warning/20">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-semibold">Predicted reaction — RM judgement required.</span>{" "}
            This forecasts the conversation to prepare the RM; it never speaks to or
            for the client.
          </span>
        </div>
      </footer>
    </section>
  );
}

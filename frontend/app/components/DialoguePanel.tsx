"use client";

import type { DialogueSuggestion } from "@/lib/types";
import { ProvenanceTag } from "./Provenance";
import { ConfirmGate } from "./ConfirmGate";

export function DialoguePanel({
  dialogue,
}: {
  dialogue: DialogueSuggestion | null;
}) {
  return (
    <section className="card flex flex-col">
      <header className="border-b border-border px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Dialogue suggestion
        </p>
        <h2 className="mt-1 text-sm font-medium leading-snug text-foreground/80">
          Conversation the RM can have with the client.
        </h2>
      </header>

      <div className="flex-1 space-y-5 p-5">
        {!dialogue ? (
          <p className="text-sm text-muted-foreground">
            No dialogue suggestion for this client.
          </p>
        ) : (
          <>
            {dialogue.style && (
              <div className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
                <span className="font-semibold">Tone — </span>
                {dialogue.style}
              </div>
            )}

            {/* talking points */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Talking points
              </p>
              <ul className="space-y-2">
                {dialogue.talking_points.map((tp, i) => (
                  <li
                    key={i}
                    className="flex flex-wrap items-start gap-1 text-sm leading-relaxed text-foreground/80"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span className="flex-1">
                      {tp.text}
                      <ProvenanceTag prov={tp.provenance} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* draft message */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Draft message
              </p>
              <blockquote className="rounded-lg border-l-4 border-primary bg-muted/40 px-4 py-3 text-sm italic leading-relaxed text-foreground/80">
                {dialogue.draft_message}
              </blockquote>
            </div>

            {/* market context footnotes */}
            {dialogue.market_context.length > 0 && (
              <div className="rounded-lg border border-dashed border-border p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  General market context · discussion only
                </p>
                <ul className="space-y-1.5">
                  {dialogue.market_context.map((mc, i) => (
                    <li
                      key={i}
                      className="flex flex-wrap items-start gap-1 text-xs leading-relaxed text-muted-foreground"
                    >
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                      <span className="flex-1">
                        {mc.text}
                        <ProvenanceTag prov={mc.provenance} label="source" />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {dialogue && (
        <footer className="border-t border-border px-5 py-4">
          <ConfirmGate
            action="Send draft (RM approve)"
            confirmQuestion="Approve sending this draft to the client?"
            approvedLabel="✓ Approved by RM — client decides"
          />
        </footer>
      )}
    </section>
  );
}

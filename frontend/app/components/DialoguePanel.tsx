"use client";

import { useState } from "react";
import { MessageCircle, ListChecks, Quote, Globe, Mail } from "lucide-react";
import type { DialogueSuggestion } from "@/lib/types";
import { api } from "@/lib/api";
import { ProvenanceTag } from "./Provenance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DialoguePanel({
  dialogue,
  clientId,
  clientName,
}: {
  dialogue: DialogueSuggestion | null;
  clientId: string;
  clientName: string;
}) {
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [draftMsg, setDraftMsg] = useState<{ ok: boolean; text: string; url?: string } | null>(null);

  async function saveDraft() {
    if (!dialogue) return;
    setBusy(true);
    setDraftMsg(null);
    try {
      const r = await api.clientDraft(clientId, {
        subject: subject || `A note for ${clientName.split(" ").slice(-1)[0]}`,
        body: dialogue.draft_message,
      });
      setDraftMsg({ ok: true, text: "Draft saved to Gmail — review & send there.", url: r.url });
    } catch (e) {
      const msg = String(e);
      setDraftMsg({
        ok: false,
        text: /409|not connected/i.test(msg) ? "Link Gmail in the sidebar first." : msg,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card flex flex-col">
      <header className="border-b border-border px-5 py-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground">
          Dialogue Suggestion
        </p>
        <h2 className="mt-1 text-base font-semibold leading-snug tracking-tight text-foreground">
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
              <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
                <MessageCircle className="h-4 w-4 shrink-0" />
                <span>
                  <span className="font-semibold">Tone — </span>
                  {dialogue.style}
                </span>
              </div>
            )}

            {/* talking points */}
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground">
                <ListChecks className="h-3.5 w-3.5" />
                Talking Points
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
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground">
                <Quote className="h-3.5 w-3.5" />
                Draft Message
                {/* honest provenance of the prose itself: model-written vs deterministic template */}
                <span
                  className="ml-1 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-border"
                  title={
                    dialogue.draft_source === "llm"
                      ? "Drafted by the language model, tuned to the client's style"
                      : "Deterministic, style-aware fallback draft (no model call)"
                  }
                >
                  {dialogue.draft_source === "llm" ? "AI-drafted" : "Template draft"}
                </span>
              </p>
              <blockquote className="rounded-md bg-muted/40 px-4 py-3 text-sm leading-relaxed text-foreground/80">
                {dialogue.draft_message}
              </blockquote>
            </div>

            {/* market context footnotes */}
            {dialogue.market_context.length > 0 && (
              <div className="rounded-md border border-dashed border-border p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" />
                  General Market Context · Discussion Only
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
        <footer className="space-y-2 border-t border-border px-5 py-4">
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            Turn this into a Gmail draft to {clientName.split(" ")[0]} — saved, never sent. The RM
            reviews &amp; sends.
          </p>
          <div className="flex items-center gap-2">
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject…"
              className="h-8 flex-1 text-sm"
            />
            <Button size="sm" onClick={saveDraft} disabled={busy}>
              {busy ? "Saving…" : "Save as Gmail draft"}
            </Button>
          </div>
          {draftMsg && (
            <p className={`text-[11px] ${draftMsg.ok ? "text-muted-foreground" : "text-destructive"}`}>
              {draftMsg.text}{" "}
              {draftMsg.url && (
                <a href={draftMsg.url} target="_blank" rel="noreferrer" className="underline">
                  open in Gmail
                </a>
              )}
            </p>
          )}
        </footer>
      )}
    </section>
  );
}

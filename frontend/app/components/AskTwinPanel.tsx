"use client";

// Ask the Twin — a free-form Q&A against the client's digital twin. The RM asks
// anything ("How would she feel about trimming tech?"); the twin predicts the
// client's likely response, grounded in cited profile facts. Any answer can then
// be auto-formatted into a ready-to-review email / text / talking points.
// Advisory only: the twin speaks to the RM about the client and never sends.

import { useState } from "react";
import {
  Copy,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  ListChecks,
  Send,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { TwinAskAnswer, TwinChannel, TwinFormatResult } from "@/lib/types";
import { api } from "@/lib/api";
import { ProvenanceTag } from "./Provenance";

const CHANNELS: { id: TwinChannel; label: string; icon: LucideIcon }[] = [
  { id: "email", label: "Email", icon: Mail },
  { id: "sms", label: "SMS", icon: MessageSquare },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "talking_points", label: "Talking points", icon: ListChecks },
  { id: "call_script", label: "Call script", icon: Phone },
];

const SUGGESTIONS = [
  "How would they react if I raised this now?",
  "What's the best way to frame this for them?",
  "What are they most likely to push back on?",
];

export function AskTwinPanel({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName?: string;
}) {
  const first = (clientName ?? "the client").split(" ")[0];

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<TwinAskAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  // autoformat
  const [channel, setChannel] = useState<TwinChannel | null>(null);
  const [formatting, setFormatting] = useState(false);
  const [draft, setDraft] = useState<TwinFormatResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function ask(q?: string) {
    const query = (q ?? question).trim();
    if (!query) return;
    setAsking(true);
    setError(null);
    setDraft(null);
    setChannel(null);
    try {
      const a = await api.twinAsk(clientId, query);
      setAnswer(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
    }
  }

  async function format(ch: TwinChannel) {
    if (!answer) return;
    setChannel(ch);
    setFormatting(true);
    setCopied(false);
    setError(null);
    try {
      const res = await api.twinFormat(clientId, { content: answer.answer, channel: ch });
      setDraft(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFormatting(false);
    }
  }

  async function copyDraft() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the textarea is selectable as a fallback */
    }
  }

  return (
    <section className="card flex flex-col">
      <header className="border-b border-border px-5 py-4">
        <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          Ask the Twin
        </p>
        <h2 className="mt-1 text-base font-semibold leading-snug tracking-tight text-foreground">
          Ask {first} anything — then turn the answer into a message.
        </h2>
      </header>

      <div className="flex-1 space-y-4 p-5">
        {/* ask box */}
        <div className="flex flex-wrap items-stretch gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder={`Ask how ${first} would react…`}
            className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:focus-ring"
          />
          <button
            type="button"
            onClick={() => ask()}
            disabled={asking || !question.trim()}
            className="btn btn-primary shrink-0 text-sm"
          >
            {asking ? "Asking…" : (<><Send className="h-4 w-4" /> Ask</>)}
          </button>
        </div>

        {/* suggestion chips (before the first answer) */}
        {!answer && !asking && (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setQuestion(s);
                  ask(s);
                }}
                className="chip bg-muted text-muted-foreground ring-1 ring-inset ring-border transition-colors hover:bg-accent"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* answer */}
        {answer && (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="chip bg-muted text-muted-foreground ring-1 ring-inset ring-border">
                  {answer.confidence} confidence
                </span>
                {answer.llm_used && (
                  <span className="chip bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
                    <Sparkles className="h-3 w-3" aria-hidden />
                    AI
                  </span>
                )}
                {answer.citations.length > 0 && (
                  <span className="ml-auto flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                    grounded in
                    {answer.citations.slice(0, 4).map((c, i) => (
                      <ProvenanceTag key={`${c.source_id}-${i}`} prov={c} label="fact" />
                    ))}
                  </span>
                )}
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">{answer.answer}</p>
            </div>

            {/* autoformat */}
            <div>
              <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground">
                Turn this into…
              </p>
              <div className="flex flex-wrap gap-1.5">
                {CHANNELS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => format(id)}
                    disabled={formatting}
                    className={`chip ring-1 ring-inset transition-colors ${
                      channel === id
                        ? "bg-primary/10 text-primary ring-primary/20"
                        : "bg-card text-muted-foreground ring-border hover:bg-accent"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* draft */}
            {(formatting || draft) && (
              <div className="rounded-md border border-border bg-card p-3">
                {formatting ? (
                  <p className="text-sm text-muted-foreground">Drafting…</p>
                ) : draft ? (
                  <>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-xs font-medium tracking-wide text-muted-foreground">
                        {CHANNELS.find((c) => c.id === draft.channel)?.label} draft
                      </span>
                      {draft.llm_used && (
                        <span className="chip bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
                          <Sparkles className="h-3 w-3" aria-hidden /> AI
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={copyDraft}
                        className="ml-auto inline-flex items-center gap-1 text-xs text-primary transition-colors hover:underline"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <textarea
                      value={draft.formatted}
                      onChange={(e) =>
                        setDraft({ ...draft, formatted: e.target.value })
                      }
                      rows={draft.channel === "sms" ? 3 : 8}
                      className="w-full resize-y rounded-md border border-border bg-card p-2 text-sm leading-relaxed text-foreground focus-visible:focus-ring"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      A draft for you to review and send — the agent never sends anything.
                    </p>
                  </>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default AskTwinPanel;

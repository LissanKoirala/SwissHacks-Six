"use client";

// Guided capture — a client-aware "pseudo-interview" that walks the RM through
// quest prompts (what did you discuss → has their position on X changed → risk /
// life / holdings / values / follow-up) so the dictated/typed log is richer.
// Pure coaching UI: it surfaces the prompts and drives the parent's mic + note;
// it never mutates anything itself.

import { useState } from "react";
import { ChevronLeft, ChevronRight, Mic, Plus } from "lucide-react";
import type { CapturePrompt } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const KIND_ICON: Record<string, string> = {
  opener: "💬",
  position: "🔁",
  risk: "⚖️",
  life: "👪",
  holdings: "📊",
  values: "🧭",
  closer: "✅",
};

export function GuidedPrompts({
  prompts,
  listening,
  speechSupported,
  onToggleDictation,
  onInsert,
}: {
  prompts: CapturePrompt[];
  listening: boolean;
  speechSupported: boolean;
  onToggleDictation: () => void;
  onInsert: (question: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(0);
  const [used, setUsed] = useState<Set<number>>(new Set());

  if (prompts.length === 0) return null;

  const idx = Math.min(step, prompts.length - 1);
  const cur = prompts[idx];
  const atFirst = idx <= 0;
  const atLast = idx >= prompts.length - 1;

  const go = (i: number) =>
    setStep(Math.max(0, Math.min(prompts.length - 1, i)));
  const insert = () => {
    onInsert(cur.question);
    setUsed((u) => new Set(u).add(idx));
  };

  return (
    <section className="mb-4 rounded-xl border border-primary/20 bg-primary/10 p-4">
      <header className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">
          Guided capture
        </span>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          — work the prompts for a richer log
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="ml-auto text-xs font-medium text-primary hover:underline"
          aria-expanded={open}
        >
          {open ? "Hide" : "Show"}
        </button>
      </header>

      {open && (
        <>
          {/* teleprompter — the current quest prompt */}
          <div className="mt-3 rounded-lg bg-card p-4 ring-1 ring-inset ring-border">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                Prompt {idx + 1} / {prompts.length}
              </span>
              <span>{used.size} added to note</span>
            </div>
            <p className="mt-1 flex items-start gap-2 text-base font-semibold leading-snug text-foreground">
              <span aria-hidden>{KIND_ICON[cur.kind] ?? "❓"}</span>
              <span>{cur.question}</span>
            </p>
            {cur.hint && (
              <p className="mt-1 pl-7 text-xs text-muted-foreground">{cur.hint}</p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => go(idx - 1)}
                disabled={atFirst}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onToggleDictation}
                disabled={!speechSupported}
                title={
                  speechSupported
                    ? "Dictate your answer to this prompt"
                    : "Dictation needs Chrome or Edge"
                }
                className={cn(
                  listening &&
                    "border-rose-500/30 bg-rose-500/10 text-rose-600 hover:bg-rose-500/15 hover:text-rose-600 dark:text-rose-400"
                )}
              >
                <Mic className="h-3.5 w-3.5" />
                {listening ? "Listening…" : "Answer aloud"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={insert}
                title="Drop this question into the note as a written cue"
              >
                <Plus className="h-3.5 w-3.5" />
                Add to note
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => go(idx + 1)}
                disabled={atLast}
                className="ml-auto"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* all prompts — jump dots, tick the ones already added */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {prompts.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => go(i)}
                title={p.question}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset transition-colors",
                  i === idx
                    ? "bg-primary text-primary-foreground ring-primary"
                    : used.has(i)
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20"
                    : "bg-card text-muted-foreground ring-border hover:bg-accent"
                )}
              >
                <span aria-hidden>{KIND_ICON[p.kind] ?? "•"}</span>{" "}
                {used.has(i) ? "✓" : i + 1}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export default GuidedPrompts;

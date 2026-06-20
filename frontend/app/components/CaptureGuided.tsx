"use client";

// Guided capture — a client-aware "pseudo-interview" that walks the RM through
// quest prompts (what did you discuss → has their position on X changed → risk /
// life / holdings / values / follow-up) so the dictated/typed log is richer.
// Pure coaching UI: it surfaces the prompts and drives the parent's mic + note;
// it never mutates anything itself.

import { useState } from "react";
import type { CapturePrompt } from "@/lib/types";

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
    <section className="mb-4 rounded-xl border border-accent/20 bg-accent-soft/40 p-4">
      <header className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-accent-ink">
          Guided capture
        </span>
        <span className="hidden text-xs text-slate-500 sm:inline">
          — work the prompts for a richer log
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="ml-auto text-xs font-medium text-accent hover:underline"
          aria-expanded={open}
        >
          {open ? "Hide" : "Show"}
        </button>
      </header>

      {open && (
        <>
          {/* teleprompter — the current quest prompt */}
          <div className="mt-3 rounded-lg bg-white p-4 ring-1 ring-inset ring-slate-200">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>
                Prompt {idx + 1} / {prompts.length}
              </span>
              <span>{used.size} added to note</span>
            </div>
            <p className="mt-1 flex items-start gap-2 text-base font-semibold leading-snug text-ink">
              <span aria-hidden>{KIND_ICON[cur.kind] ?? "❓"}</span>
              <span>{cur.question}</span>
            </p>
            {cur.hint && (
              <p className="mt-1 pl-7 text-xs text-slate-500">{cur.hint}</p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => go(idx - 1)}
                disabled={atFirst}
                className="btn-ghost text-xs disabled:cursor-not-allowed disabled:opacity-40"
              >
                ◀ Prev
              </button>
              <button
                type="button"
                onClick={onToggleDictation}
                disabled={!speechSupported}
                title={
                  speechSupported
                    ? "Dictate your answer to this prompt"
                    : "Dictation needs Chrome or Edge"
                }
                className={`btn text-xs ring-1 ring-inset transition-colors ${
                  !speechSupported
                    ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 ring-slate-200"
                    : listening
                    ? "border-rose-300 bg-rose-50 text-rose-700 ring-rose-200"
                    : "border-slate-300 bg-white text-ink-soft ring-transparent hover:bg-slate-50"
                }`}
              >
                <span aria-hidden>🎙</span>
                {listening ? "Listening…" : "Answer aloud"}
              </button>
              <button
                type="button"
                onClick={insert}
                title="Drop this question into the note as a written cue"
                className="btn text-xs border-slate-300 bg-white text-ink-soft ring-1 ring-inset ring-transparent hover:bg-slate-50"
              >
                ＋ Add to note
              </button>
              <button
                type="button"
                onClick={() => go(idx + 1)}
                disabled={atLast}
                className="btn-ghost ml-auto text-xs disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next ▶
              </button>
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
                className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset transition-colors ${
                  i === idx
                    ? "bg-accent text-white ring-accent"
                    : used.has(i)
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50"
                }`}
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

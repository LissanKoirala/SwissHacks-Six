"use client";

// RM Capture — multimodal interaction note (CLAUDE.md §8.B, CAPTURE_CONTRACT §3).
// Type / dictate (Web Speech) / photo (tesseract.js OCR, in-browser) fill ONE
// note textarea → Extract (read-only draft) → staged review → RM Confirm gate
// (the only mutation). Light theme only; reuses card/chip/accent/ink tokens.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CaptureDraft,
  CapturePrompt,
  CaptureResult,
  ProposedEdge,
  ProposedFacet,
} from "@/lib/types";
import { api } from "@/lib/api";
import { StagedPanel, extractErrorMessage } from "./CaptureStaged";
import { GuidedPrompts } from "./CaptureGuided";

/* --------------------------------------------------------------- consts --- */

const MODALITIES = [
  "Physical Meeting",
  "Phone Call",
  "Video Call",
  "Email",
  "Lunch",
  "File Note",
  "Physical Event",
] as const;

const NOTE_MAX = 5000; // mirror the backend cap (CAPTURE_CONTRACT §1).

// Shared field styling — keep the long Tailwind strings in one place.
const FIELD =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-slate-400 focus:border-accent focus:ring-2 focus:ring-accent/20";
const LABEL = "mb-1 block text-xs font-medium text-slate-500";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ---------------------------------------------------- Web Speech typings --- */
// Minimal shape for the bits we use — the lib DOM types don't ship the
// webkit-prefixed constructor, so we feature-detect off `window`.

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.webkitSpeechRecognition ?? w.SpeechRecognition ?? null;
}

/* -------------------------------------------------------------- helpers --- */

// Append a chunk to the note with sensible spacing, respecting the cap.
function appendToNote(prev: string, chunk: string): string {
  const piece = chunk.trim();
  if (!piece) return prev;
  const base = prev.trimEnd();
  const joined = base ? `${base} ${piece}` : piece;
  return joined.slice(0, NOTE_MAX);
}

// A neutral slate chip — the recurring metadata pill in the success summary.
function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="chip bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">
      {children}
    </span>
  );
}

/* ============================================================ component === */

export function CaptureNote({
  clientId,
  onSaved,
}: {
  clientId: string;
  onSaved?: () => void;
}) {
  // --- input form ---
  const [note, setNote] = useState("");
  const [modality, setModality] = useState<string>("File Note");
  const [contact, setContact] = useState("");
  const [date, setDate] = useState<string>(todayISO());
  const [rmName, setRmName] = useState("");

  // --- guided capture prompts (client-aware quest list) ---
  const [prompts, setPrompts] = useState<CapturePrompt[]>([]);

  // --- dictation (Web Speech) ---
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalBaseRef = useRef(""); // note text captured when dictation started
  const speechSupported = useMemo(() => getSpeechRecognitionCtor() !== null, []);

  // --- OCR (tesseract.js) ---
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrMsg, setOcrMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- extract / confirm lifecycle ---
  const [draft, setDraft] = useState<CaptureDraft | null>(null);
  const [edges, setEdges] = useState<ProposedEdge[]>([]);
  const [facets, setFacets] = useState<ProposedFacet[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CaptureResult | null>(null);

  // Stop dictation + cleanup if the client changes or we unmount.
  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* noop */
      }
    };
  }, []);

  // Reset everything when switching clients.
  useEffect(() => {
    setNote("");
    setModality("File Note");
    setContact("");
    setDate(todayISO());
    setRmName("");
    setDraft(null);
    setEdges([]);
    setFacets([]);
    setResult(null);
    setError(null);
    setOcrMsg(null);
    setOcrBusy(false);
    if (listening) stopDictation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // Fetch the client-aware guided prompts (read-only; degrade to none on error).
  useEffect(() => {
    let alive = true;
    api
      .capturePrompts(clientId)
      .then((d) => alive && setPrompts(d.prompts))
      .catch(() => alive && setPrompts([]));
    return () => {
      alive = false;
    };
  }, [clientId]);

  // Drop a prompt's question into the note as a written cue (newline-preserving).
  function insertPromptLead(question: string) {
    setNote((prev) => {
      const base = prev.trimEnd();
      const lead = base ? `${base}\n\n${question}\n` : `${question}\n`;
      return lead.slice(0, NOTE_MAX);
    });
  }

  /* ----------------------------------------------------- dictation --- */

  function stopDictation() {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* noop */
    }
    setListening(false);
  }

  function startDictation() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-GB";
    rec.continuous = true;
    rec.interimResults = true;
    finalBaseRef.current = note;

    rec.onresult = (e: SpeechRecognitionEventLike) => {
      let interim = "";
      let finalChunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0]?.transcript ?? "";
        if (res.isFinal) finalChunk += text;
        else interim += text;
      }
      if (finalChunk) {
        finalBaseRef.current = appendToNote(finalBaseRef.current, finalChunk);
      }
      // Live preview = committed base + the in-flight interim words.
      setNote(appendToNote(finalBaseRef.current, interim));
    };
    rec.onerror = (ev: { error?: string }) => {
      setListening(false);
      if (ev.error && ev.error !== "aborted") {
        setOcrMsg(null);
        setError(`Dictation error: ${ev.error}. You can keep typing.`);
      }
    };
    rec.onend = () => {
      setNote(finalBaseRef.current);
      setListening(false);
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
      setError(null);
    } catch {
      setListening(false);
    }
  }

  const toggleDictation = useCallback(() => {
    if (listening) stopDictation();
    else startDictation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening, note]);

  /* ----------------------------------------------------------- OCR --- */

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Allow re-selecting the same file later.
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;

    setOcrBusy(true);
    setOcrMsg("Reading the photo…");
    setError(null);
    try {
      // Dynamic import inside the handler — keeps the WASM/worker out of SSR
      // and the main bundle until the RM actually snaps a photo.
      const { default: Tesseract } = await import("tesseract.js");
      const { data } = await Tesseract.recognize(file, "eng", {
        logger: (m: { status?: string; progress?: number }) => {
          if (m.status === "recognizing text" && typeof m.progress === "number") {
            setOcrMsg(`Reading the photo… ${Math.round(m.progress * 100)}%`);
          }
        },
      });
      const text = (data?.text ?? "").trim();
      if (text) {
        setNote((prev) => appendToNote(prev, text));
        setOcrMsg("Photo read — text added to the note.");
      } else {
        setOcrMsg("No text found in that image. You can type the note instead.");
      }
    } catch {
      // OCR failure must never block capture — friendly nudge, RM types on.
      setOcrMsg(
        "Could not read that image. You can type the note instead.",
      );
    } finally {
      setOcrBusy(false);
    }
  }

  /* ------------------------------------------------------- extract --- */

  async function handleExtract() {
    const trimmed = note.trim();
    if (!trimmed) {
      setError("Add a note first — type it, dictate it, or read it from a photo.");
      return;
    }
    if (listening) stopDictation();
    setExtracting(true);
    setError(null);
    setResult(null);
    try {
      const d = await api.captureExtract(clientId, {
        note: trimmed,
        modality,
        contact,
        rm_name: rmName,
        date,
      });
      setDraft(d);
      // Clone proposals into editable local state (default-on selection).
      setEdges(d.proposed_edges.map((x) => ({ ...x })));
      setFacets(d.proposed_facets.map((x) => ({ ...x })));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setExtracting(false);
    }
  }

  /* ------------------------------------------------------- confirm --- */

  async function handleConfirm() {
    if (!draft) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await api.captureConfirm(clientId, {
        note: draft.note,
        modality: draft.modality,
        contact: draft.contact,
        rm_name: draft.rm_name,
        date: draft.date,
        // Only the RM-kept rows are applied; the backend re-validates topics.
        edges: edges.filter((e) => e.selected),
        facets: facets
          .filter((f) => f.selected && f.text.trim())
          .map((f) => ({ ...f, text: f.text.trim() })),
      });
      setResult(res);
      onSaved?.();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setConfirming(false);
    }
  }

  function resetAll() {
    setNote("");
    setModality("File Note");
    setContact("");
    setDate(todayISO());
    setRmName("");
    setDraft(null);
    setEdges([]);
    setFacets([]);
    setResult(null);
    setError(null);
    setOcrMsg(null);
  }

  /* ----------------------------------------- edit handlers (immutable) --- */

  function patchEdge(i: number, patch: Partial<ProposedEdge>) {
    setEdges((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }
  function patchFacet(i: number, patch: Partial<ProposedFacet>) {
    setFacets((prev) =>
      prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)),
    );
  }

  const selectedEdgeCount = edges.filter((e) => e.selected).length;
  const selectedFacetCount = facets.filter(
    (f) => f.selected && f.text.trim(),
  ).length;

  /* =================================================== success state === */

  if (result) {
    return (
      <section className="card p-6">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
            aria-hidden
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.3 3.29 6.8-6.8a1 1 0 0 1 1.4 0Z"
                clipRule="evenodd"
              />
            </svg>
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink">
              Note appended to the meeting log
            </h3>
            <p className="mt-1 text-sm text-ink-soft">
              The entry is now immutable and flows into the profile, CRM network
              and risk timeline.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="chip bg-indigo-50 font-mono text-[11px] text-indigo-700 ring-1 ring-inset ring-indigo-200">
                {result.entry_id}
              </span>
              <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">
                applied {result.applied.edges} edge
                {result.applied.edges === 1 ? "" : "s"} / {result.applied.facets}{" "}
                facet{result.applied.facets === 1 ? "" : "s"}
              </span>
              <MetaChip>
                {result.log_count} log entr
                {result.log_count === 1 ? "y" : "ies"} total
              </MetaChip>
            </div>
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <button type="button" className="btn-primary" onClick={resetAll}>
            Capture another
          </button>
        </div>
      </section>
    );
  }

  /* =============================================== input + staged view === */

  return (
    <div className="space-y-5">
      {/* ---------------------------------------------------- input card --- */}
      <section className="card p-5">
        <header className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">
            New interaction note
          </p>
          <h2 className="mt-1 text-base font-semibold text-ink">
            Capture by text, voice or photo
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Everything below is a draft. Nothing touches the live profile until
            you review and confirm.
          </p>
        </header>

        {/* guided capture — client-aware quest prompts */}
        <GuidedPrompts
          prompts={prompts}
          listening={listening}
          speechSupported={speechSupported}
          onToggleDictation={toggleDictation}
          onInsert={insertPromptLead}
        />

        {/* mode buttons */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Add via
          </span>

          {/* Dictate */}
          <button
            type="button"
            onClick={toggleDictation}
            disabled={!speechSupported}
            aria-pressed={listening}
            title={
              speechSupported
                ? listening
                  ? "Stop dictation"
                  : "Dictate the note (Chrome/Edge)"
                : "Dictation needs Chrome or Edge"
            }
            className={`btn ring-1 ring-inset transition-colors ${
              !speechSupported
                ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 ring-slate-200"
                : listening
                ? "border-rose-300 bg-rose-50 text-rose-700 ring-rose-200"
                : "border-slate-300 bg-white text-ink-soft ring-transparent hover:bg-slate-50"
            }`}
          >
            <span aria-hidden>🎙</span>
            {listening ? (
              <span className="flex items-center gap-1.5">
                Listening
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
                </span>
              </span>
            ) : (
              "Dictate"
            )}
          </button>

          {/* Photo / OCR */}
          <label
            className={`btn border border-slate-300 bg-white text-ink-soft ring-1 ring-inset ring-transparent hover:bg-slate-50 ${
              ocrBusy ? "cursor-wait opacity-70" : "cursor-pointer"
            }`}
            title="Read a printed/handwritten note via in-browser OCR"
          >
            <span aria-hidden>📷</span>
            {ocrBusy ? "Reading…" : "Photo"}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={ocrBusy}
              onChange={handlePhoto}
            />
          </label>

          {ocrMsg && (
            <span className="text-xs text-slate-500">
              {ocrBusy && (
                <span
                  className="mr-1.5 inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-accent align-middle"
                  aria-hidden
                />
              )}
              {ocrMsg}
            </span>
          )}
        </div>

        {/* the single note textarea (Type mode is default) */}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
          rows={6}
          maxLength={NOTE_MAX}
          placeholder="Type the interaction here — or dictate / snap a photo above. e.g. “Lunch at Kronenhalle. Hubertus wants to fund Parkinson's research and is proud of the foundation's work.”"
          className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-ink shadow-sm outline-none placeholder:text-slate-400 focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <div className="mt-1 flex justify-between text-[11px] text-slate-400">
          <span>
            Dictation needs Chrome/Edge · OCR runs locally in your browser
          </span>
          <span className="tabular-nums">
            {note.length} / {NOTE_MAX}
          </span>
        </div>

        {/* metadata row */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className={LABEL}>Modality</span>
            <select
              value={modality}
              onChange={(e) => setModality(e.target.value)}
              className={FIELD}
            >
              {MODALITIES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={LABEL}>Contact</span>
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Who you spoke with"
              className={FIELD}
            />
          </label>
          <label className="block">
            <span className={LABEL}>Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="block">
            <span className={LABEL}>
              RM <span className="font-normal text-slate-400">(optional)</span>
            </span>
            <input
              type="text"
              value={rmName}
              onChange={(e) => setRmName(e.target.value)}
              placeholder="Your name"
              className={FIELD}
            />
          </label>
        </div>

        {/* extract action */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-primary"
            onClick={handleExtract}
            disabled={extracting || !note.trim()}
          >
            {extracting ? (
              <>
                <span
                  className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  aria-hidden
                />
                Extracting…
              </>
            ) : draft ? (
              "Re-extract"
            ) : (
              "Extract signals"
            )}
          </button>
          {draft && (
            <button type="button" className="btn-ghost" onClick={resetAll}>
              Clear
            </button>
          )}
          <span className="text-xs text-slate-400">
            Read-only — proposes topics &amp; signals for your review.
          </span>
        </div>

        {error && !draft && (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
      </section>

      {/* --------------------------------------------------- staged panel --- */}
      {draft && (
        <StagedPanel
          draft={draft}
          edges={edges}
          facets={facets}
          patchEdge={patchEdge}
          patchFacet={patchFacet}
          selectedEdgeCount={selectedEdgeCount}
          selectedFacetCount={selectedFacetCount}
          confirming={confirming}
          error={error}
          onConfirm={handleConfirm}
          onDiscard={resetAll}
        />
      )}
    </div>
  );
}

export default CaptureNote;

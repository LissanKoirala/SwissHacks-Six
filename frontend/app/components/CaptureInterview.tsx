"use client";

// Conversational capture — a spoken back-and-forth that builds a comprehensive
// note. A TTS voice (browser speechSynthesis, keyless) asks one follow-up at a
// time; the RM answers aloud (server STT, or browser Web Speech as a fallback);
// the transcript is appended to the parent note and drives the next question
// (GET .../capture/followup — LLM-led when configured, guided quest list
// offline). Push-to-talk turn-taking keeps it robust. It never mutates the
// profile — answers only fill the same draft note the RM later reviews/confirms.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Mic,
  MessagesSquare,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/* --------------------------------------------------- speech recognition --- */
// Same minimal Web Speech shape the parent uses, kept local so this component
// stands alone.
interface SR {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
interface SREvent {
  resultIndex: number;
  results: { length: number; [i: number]: { 0: { transcript: string }; isFinal: boolean } };
}
type SRCtor = new () => SR;

function getSRCtor(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.webkitSpeechRecognition ?? w.SpeechRecognition ?? null;
}

function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

type Phase = "idle" | "thinking" | "asking" | "ready" | "recording" | "transcribing" | "done";

/* ============================================================ component === */

export function CaptureInterview({
  clientId,
  baseNote,
  serverSttEnabled,
  serverTtsEnabled,
  mediaSupported,
  onAppend,
}: {
  clientId: string;
  baseNote: string; // the note as it stands when the interview starts
  serverSttEnabled: boolean;
  serverTtsEnabled: boolean; // ElevenLabs voice via /api/tts
  mediaSupported: boolean;
  onAppend: (text: string) => void;
}) {
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const askedRef = useRef<string[]>([]);
  const noteRef = useRef(baseNote); // running transcript fed to the follow-up engine
  const lastDoneRef = useRef(false); // the current question was flagged final

  // answer-capture plumbing
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const srRef = useRef<SR | null>(null);
  const srTextRef = useRef("");
  const audioRef = useRef<HTMLAudioElement | null>(null); // ElevenLabs playback

  const speechSupported = useMemo(() => getSRCtor() !== null, []);
  const browserTts = useMemo(ttsSupported, []);
  const useServer = serverSttEnabled && mediaSupported;
  const canAnswer = useServer || speechSupported;
  const canSpeak = serverTtsEnabled || browserTts;

  /* ------------------------------------------------------------- TTS --- */

  const stopSpeaking = useCallback(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* noop */
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  const browserSpeak = useCallback(
    (text: string, onDone: () => void) => {
      if (!browserTts) {
        onDone();
        return;
      }
      try {
        const synth = window.speechSynthesis;
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "en-GB";
        u.rate = 1;
        u.onend = onDone;
        u.onerror = onDone;
        synth.speak(u);
      } catch {
        onDone();
      }
    },
    [browserTts],
  );

  // Prefer the ElevenLabs voice; fall back to the browser voice on any failure.
  const speak = useCallback(
    (text: string, onDone: () => void) => {
      stopSpeaking();
      if (!serverTtsEnabled) {
        browserSpeak(text, onDone);
        return;
      }
      api
        .tts(text)
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;
          const cleanup = () => URL.revokeObjectURL(url);
          audio.onended = () => {
            cleanup();
            onDone();
          };
          audio.onerror = () => {
            cleanup();
            browserSpeak(text, onDone);
          };
          audio.play().catch(() => {
            cleanup();
            browserSpeak(text, onDone);
          });
        })
        .catch(() => browserSpeak(text, onDone));
    },
    [serverTtsEnabled, browserSpeak, stopSpeaking],
  );

  /* --------------------------------------------------- question turns --- */

  const askNext = useCallback(async () => {
    setPhase("thinking");
    setError(null);
    try {
      const res = await api.captureFollowup(clientId, {
        note: noteRef.current,
        asked: askedRef.current,
      });
      if (res.done && !res.question) {
        setPhase("done");
        setQuestion("");
        return;
      }
      if (res.id) askedRef.current = [...askedRef.current, res.id];
      lastDoneRef.current = res.done;
      setQuestion(res.question);
      setPhase("asking");
      speak(res.question, () => setPhase("ready"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("ready");
    }
  }, [clientId, speak]);

  function startInterview() {
    askedRef.current = [];
    noteRef.current = baseNote;
    lastDoneRef.current = false;
    setTurns(0);
    setActive(true);
    void askNext();
  }

  /* ----------------------------------------------- record the answer --- */

  function finishAnswer(text: string) {
    const clean = text.trim();
    if (clean) {
      noteRef.current = `${noteRef.current} ${clean}`.trim();
      onAppend(clean);
      setTurns((t) => t + 1);
    }
    if (lastDoneRef.current) {
      setPhase("done");
      setQuestion("");
      return;
    }
    void askNext();
  }

  async function startServerRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const rec = new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      audioChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        const mime = rec.mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: mime });
        audioChunksRef.current = [];
        if (blob.size === 0) {
          setPhase("ready");
          return;
        }
        setPhase("transcribing");
        try {
          const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";
          const { text } = await api.transcribe(blob, `answer.${ext}`);
          finishAnswer(text || "");
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          setPhase("ready");
        }
      };
      rec.start();
      setPhase("recording");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("ready");
    }
  }

  function startWebSpeech() {
    const Ctor = getSRCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-GB";
    rec.continuous = true;
    rec.interimResults = false;
    srTextRef.current = "";
    rec.onresult = (e: SREvent) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) srTextRef.current += r[0]?.transcript ?? "";
      }
    };
    rec.onerror = (ev: { error?: string }) => {
      if (ev.error && ev.error !== "aborted") setError(`Dictation error: ${ev.error}.`);
    };
    rec.onend = () => finishAnswer(srTextRef.current);
    srRef.current = rec;
    try {
      rec.start();
      setPhase("recording");
      setError(null);
    } catch {
      setPhase("ready");
    }
  }

  function startAnswer() {
    stopSpeaking();
    if (useServer) void startServerRecording();
    else if (speechSupported) startWebSpeech();
  }

  function stopAnswer() {
    if (useServer) {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        /* noop */
      }
    } else {
      try {
        srRef.current?.stop();
      } catch {
        /* noop */
      }
    }
  }

  function endInterview() {
    stopSpeaking();
    stopAnswer();
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    setActive(false);
    setPhase("idle");
    setQuestion("");
  }

  // Cleanup on unmount / client switch.
  useEffect(() => {
    return () => {
      stopSpeaking();
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        /* noop */
      }
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        srRef.current?.stop();
      } catch {
        /* noop */
      }
    };
  }, [clientId, stopSpeaking]);

  /* ----------------------------------------------------------- render --- */

  if (!active) {
    return (
      <div className="mb-3">
        <Button
          type="button"
          variant="outline"
          onClick={startInterview}
          disabled={!canAnswer}
          title={
            canAnswer
              ? "Start a spoken interview — the assistant asks follow-ups, you answer aloud"
              : "Voice interview needs a microphone (server STT) or Chrome/Edge"
          }
        >
          <MessagesSquare className="h-4 w-4" />
          Voice interview
        </Button>
        {!canSpeak && canAnswer && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Questions will appear as text — this browser can&apos;t speak them aloud.
          </p>
        )}
      </div>
    );
  }

  const recording = phase === "recording";
  const busy = phase === "thinking" || phase === "transcribing";

  return (
    <section className="mb-4 rounded-md border border-primary/30 bg-primary/[0.06] p-4">
      <header className="flex items-center gap-2">
        <MessagesSquare className="h-4 w-4 text-primary" aria-hidden />
        <span className="text-xs font-medium tracking-wide text-muted-foreground">
          <span className="hl">Voice</span> Interview
        </span>
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
          {turns} answer{turns === 1 ? "" : "s"} captured
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={endInterview}>
          <X className="h-3.5 w-3.5" />
          End
        </Button>
      </header>

      {phase === "done" ? (
        <div className="mt-3 flex items-start gap-2 rounded-md bg-card p-4 ring-1 ring-inset ring-border">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-foreground">
              Interview complete — {turns} answer{turns === 1 ? "" : "s"} added to the note.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Review the note below, then Extract signals to stage it.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-3 rounded-md bg-card p-4 ring-1 ring-inset ring-border">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {busy
                  ? phase === "transcribing"
                    ? "Transcribing your answer…"
                    : "Thinking of the next question…"
                  : recording
                  ? "Listening — answer aloud, then Stop"
                  : phase === "asking"
                  ? "Asking…"
                  : "Your turn"}
              </span>
              {canSpeak && question && (
                <button
                  type="button"
                  onClick={() => {
                    setPhase("asking");
                    speak(question, () => setPhase("ready"));
                  }}
                  className="inline-flex items-center gap-1 rounded-md text-primary transition-colors hover:underline focus-visible:focus-ring"
                  title="Repeat the question"
                >
                  <Volume2 className="h-3 w-3" />
                  Repeat
                </button>
              )}
            </div>
            <p className="mt-1 min-h-[1.5rem] text-base font-semibold leading-snug text-foreground">
              {question || (busy ? "…" : "")}
            </p>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {recording ? (
              <Button
                type="button"
                onClick={stopAnswer}
                className="border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive"
                variant="outline"
              >
                <Square className="h-4 w-4" />
                Stop &amp; transcribe
              </Button>
            ) : (
              <Button
                type="button"
                onClick={startAnswer}
                disabled={phase !== "ready" || busy}
              >
                <Mic className="h-4 w-4" />
                Answer aloud
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                stopAnswer();
                if (lastDoneRef.current) {
                  setPhase("done");
                  setQuestion("");
                } else {
                  void askNext();
                }
              }}
              disabled={busy || recording}
              title="Skip this question"
            >
              Skip
            </Button>
            <span className="text-[11px] text-muted-foreground">
              {useServer ? "Server STT" : speechSupported ? "Browser dictation" : ""}
            </span>
          </div>
        </>
      )}

      {error && (
        <p className="mt-3 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

export default CaptureInterview;

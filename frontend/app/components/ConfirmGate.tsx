"use client";

import { useState } from "react";

type Phase = "idle" | "confirm" | "approved";

/**
 * RM confirm gate (CLAUDE.md §2 golden rule: nothing auto-executes).
 * Purely a local, non-destructive mock — no network mutation. The RM clicks,
 * confirms, and the control settles into an "approved" state.
 */
export function ConfirmGate({
  action,
  confirmQuestion,
  approvedLabel,
}: {
  action: string;
  confirmQuestion: string;
  approvedLabel: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");

  if (phase === "approved") {
    return (
      <div className="flex items-center gap-2 rounded-md bg-success/10 px-3.5 py-2 text-sm font-medium text-success ring-1 ring-inset ring-success/25">
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M3.5 8.5 7 12l6-7"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {approvedLabel}
      </div>
    );
  }

  if (phase === "confirm") {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md bg-warning/10 px-3 py-2 ring-1 ring-inset ring-warning/25">
        <span className="text-sm font-medium text-warning">
          {confirmQuestion}
        </span>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            className="btn-primary px-3 py-1.5"
            onClick={() => setPhase("approved")}
          >
            Yes, approve
          </button>
          <button
            type="button"
            className="btn-ghost px-3 py-1.5"
            onClick={() => setPhase("idle")}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="btn-primary"
      onClick={() => setPhase("confirm")}
    >
      {action}
    </button>
  );
}

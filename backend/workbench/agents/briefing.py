"""Briefing composer (spec §7/§9). Deterministic by default — assembles an SMS-ready brief
from the already-templated /overview `briefing` plus the top priority tasks. No LLM this
round; the Protocol keeps a Phoeniqs/Ollama backend a drop-in swap later (spec §10)."""
from __future__ import annotations

from typing import Protocol

from ..config import settings

SMS_MAX = 480


class BriefingComposer(Protocol):
    def compose(self, overview: dict) -> str: ...


class DeterministicComposer:
    """Plain templating over the overview payload — offline, instant, never breaks."""

    def compose(self, overview: dict) -> str:
        lines: list[str] = ["☀️ Morning briefing"]
        brief = (overview.get("briefing") or "").strip()
        if brief:
            lines.append(brief)

        # One bullet per DISTINCT client — a client with several matching news items must not repeat
        # (priority_tasks holds one entry per match). The brief line above already names the top
        # client, so the bullets surface the *other* clients who also need attention.
        tasks = overview.get("priority_tasks") or []
        seen: set = set()
        distinct: list[dict] = []
        for t in tasks:
            key = t.get("client_id") or t.get("client_name")
            if key in seen:
                continue
            seen.add(key)
            distinct.append(t)

        for t in distinct[1:3]:
            name = t.get("client_name", "")
            reason = (t.get("reason") or "").strip()
            mark = "‼️" if t.get("severity") == "high" else "•"
            lines.append(f"{mark} {name}: {reason}")

        n_clients = len(distinct)
        n_meet = len(overview.get("meetings") or [])
        lines.append(
            f"— {n_clients} client{'s' if n_clients != 1 else ''} flagged, "
            f"{n_meet} meeting{'s' if n_meet != 1 else ''} today. Open the workbench for detail."
        )

        text = "\n".join(lines)
        if len(text) > SMS_MAX:
            text = text[: SMS_MAX - 1].rstrip() + "…"
        return text


def get_composer() -> BriefingComposer:
    # spec §10: phoeniqs / ollama backends swap in here behind settings.briefing_composer.
    return DeterministicComposer()

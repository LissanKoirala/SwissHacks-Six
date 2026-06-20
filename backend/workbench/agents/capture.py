"""RM Capture builder (CAPTURE_CONTRACT §2; CLAUDE.md §8.B).

The RM adds a multimodal interaction note (text / dictation / OCR). The backend
**extracts** candidate signals into a read-only staged draft; on **confirm** the
immutable `meeting_log` gets one appended entry AND the RM-approved
topics/interest-edges/facet updates materialise into the live profile — every
materialised fact citing the new log entry's provenance.

Golden rules (do not break): advisory only — the agent *proposes*, the RM
*confirms*. `extract_draft` is read-only; `confirm_capture` is the ONLY mutation.
The meeting log is append-only / immutable. Deterministic + offline-first (no LLM
required). Confirmed payloads write through to `data/captured_entries.json` and
replay on boot so captures survive a restart.
"""
from __future__ import annotations

import json
from datetime import date as _date
from typing import Optional

from ..config import DATA_DIR
from ..graph.crm_graph import MEDIUM_ICON, MEDIUM_ICON_DEFAULT
from ..models import (
    CaptureConfirmRequest,
    CaptureExtractRequest,
    InterestEdge,
    MeetingLogEntry,
    Provenance,
    RiskSignal,
    Statement,
)
from ..topics import TOPIC_VOCAB, classify_text
from .llm import chat_json, llm_available
from .risk_timeline import preview_from_signals, score_note

# Write-through store of confirmed captures (a JSON list). Git-ignored; replayed on
# boot by seed.build_world. Module-level so a test can monkeypatch it at a temp path.
CAPTURED_PATH = DATA_DIR / "captured_entries.json"

_NOTE_MAX = 5000
_VALID_FACETS = {"professional", "interests", "historical", "personality"}

# --- deterministic polarity / facet cue lexicons (§2) -----------------------
# Matched as lowercase substrings on the normalised note.

_CONFLICT_CUES = [
    "avoid", "penalise", "penalize", "divest", "exit", "betrayal", "against",
    "refuse", "dump", "exposed", "scandal", "unacceptable", "never", "hypocrisy",
    "red line", "zero tolerance", "won't hold", "drop",
]

_OPPORTUNITY_CUES = [
    "support", "fund", "reward", "want more", "increase", "celebrate", "proud",
    "back", "champion", "prioritise", "prioritize", "commit", "passionate",
    "believe in", "double down", "magnificent",
]

# Facet-guess cues (first match wins, in priority order: personality → professional
# → historical → else interests).
_PERSONALITY_CUES = ["averse", "tolerance", "values", "ethics", "betrayal", "principle"]
_PROFESSIONAL_CUES = ["ceo", "business", "company", "enterprise", "board", "firm"]
_HISTORICAL_CUES = [
    "transferred", "withdrew", "endowment", "capital call", "bought", "sold", "deposit",
]


# --- helpers ----------------------------------------------------------------

def _normalise(note: str) -> str:
    """Trim and collapse internal whitespace runs to single spaces."""
    return " ".join((note or "").split())


def _resolve_date(raw: str) -> str:
    """Server today (ISO) when the supplied date is blank."""
    raw = (raw or "").strip()
    return raw or _date.today().isoformat()


def _modality_icon(modality: str) -> str:
    return MEDIUM_ICON.get(modality or "", MEDIUM_ICON_DEFAULT)


def _next_id(world, client_id: str, date: str) -> str:
    """The id the next appended entry WILL get: `{client_id}#{date}#{count+1}`."""
    existing = world.meeting_logs.get(client_id, [])
    return f"{client_id}#{date}#{len(existing) + 1}"


def _first_match(low: str, cues: list[str]) -> Optional[str]:
    for cue in cues:
        if cue in low:
            return cue
    return None


def _polarity(low: str) -> tuple[str, Optional[str]]:
    """(polarity, matched_cue). Conflict wins if both present; else opportunity; else
    neutral."""
    conflict = _first_match(low, _CONFLICT_CUES)
    if conflict:
        return "conflict", conflict
    opportunity = _first_match(low, _OPPORTUNITY_CUES)
    if opportunity:
        return "opportunity", opportunity
    return "neutral", None


def _facet_guess(low: str) -> tuple[str, Optional[str]]:
    """(facet, matched_cue). personality > professional > historical > interests."""
    for facet, cues in (
        ("personality", _PERSONALITY_CUES),
        ("professional", _PROFESSIONAL_CUES),
        ("historical", _HISTORICAL_CUES),
    ):
        cue = _first_match(low, cues)
        if cue:
            return facet, cue
    return "interests", None


def _first_sentences(note: str, limit: int = 2) -> list[str]:
    """Up to `limit` concise candidate statements: the note's leading sentence(s)."""
    text = note.strip()
    if not text:
        return []
    out: list[str] = []
    buf = ""
    for ch in text:
        buf += ch
        if ch in ".!?":
            piece = buf.strip()
            if len(piece) > 3:
                out.append(piece)
                buf = ""
            if len(out) >= limit:
                break
    if buf.strip() and len(out) < limit:
        tail = buf.strip()
        if len(tail) > 3:
            out.append(tail)
    # Drop a near-duplicate second candidate (not clearly distinct).
    if len(out) == 2 and out[1].lower().startswith(out[0].lower()[:20]):
        out = out[:1]
    return out[:limit]


def _rationale(topic_label: str, polarity: str, cue: Optional[str]) -> str:
    if cue:
        return f"Note mentions '{cue}' → {polarity} signal on {topic_label}."
    return f"{topic_label} surfaced in the note (no strong polarity cue) → neutral."


# --- LLM extraction (read-only; falls back to the keyword path) -------------

def _topic_guide() -> str:
    """The controlled topic vocabulary, as a prompt-friendly bullet list."""
    return "\n".join(
        f"- {key}: {t.label} — {t.description}" for key, t in TOPIC_VOCAB.items()
    )


_FACET_GUIDE = (
    "- professional: work context and professionally-linked interests\n"
    "- interests: personal / recurring interests\n"
    "- historical: notable behaviour, decisions or transactions\n"
    "- personality: risk appetite, communication style, values / ethics"
)

_LLM_SYSTEM = (
    "You are a CRM analyst for a wealth relationship manager (RM). You read one raw "
    "interaction note and extract structured, citable signals. You never advise the "
    "client and never invent facts not present in the note. Be conservative: only "
    "surface a signal the note actually supports."
)


def _llm_extract(note: str) -> Optional[dict]:
    """Extract topics/facets/risk cues from arbitrary note text via Phoeniqs. Returns
    the signal-bearing parts of the draft, or None if the LLM is off or the call
    fails (caller then uses the deterministic keyword path). Read-only."""
    if not llm_available() or not note:
        return None

    user = (
        f"NOTE:\n{note}\n\n"
        "Map the note onto this controlled topic vocabulary (use ONLY these keys; "
        "omit a topic if the note doesn't clearly relate to it):\n"
        f"{_topic_guide()}\n\n"
        "Facet definitions:\n"
        f"{_FACET_GUIDE}\n\n"
        "Return JSON with this exact shape:\n"
        '{"topics":[{"topic":"<vocab key>","facet":"<facet>",'
        '"polarity":"opportunity|conflict|neutral","rationale":"<short why, grounded in the note>"}],'
        '"facets":[{"facet":"<facet>","text":"<one concise profile statement from the note>"}],'
        '"risk_signals":[{"term":"<short phrase from the note>","direction":"up|down"}]}\n'
        "polarity: opportunity = client wants more of this; conflict = wants to avoid it; "
        "else neutral. risk direction: up = more risk appetite (growth/conviction/add), "
        "down = more cautious (preserve/trim/worried). Return empty arrays where nothing applies."
    )
    data = chat_json(_LLM_SYSTEM, user, max_tokens=900)
    if not isinstance(data, dict):
        return None

    detected_topics: list[dict] = []
    proposed_edges: list[dict] = []
    seen_topics: set[str] = set()
    for raw in data.get("topics") or []:
        topic = (raw.get("topic") or "").strip()
        if topic not in TOPIC_VOCAB or topic in seen_topics:
            continue
        seen_topics.add(topic)
        label = TOPIC_VOCAB[topic].label
        facet = raw.get("facet") if raw.get("facet") in _VALID_FACETS else "interests"
        polarity = raw.get("polarity")
        if polarity not in ("opportunity", "conflict", "neutral"):
            polarity = "neutral"
        rationale = _normalise(raw.get("rationale") or "") or _rationale(label, polarity, None)
        detected_topics.append({"topic": topic, "label": label})
        proposed_edges.append({
            "topic": topic,
            "topic_label": label,
            "facet": facet,
            "polarity": polarity,
            "rationale": rationale,
            "selected": True,
        })

    proposed_facets: list[dict] = []
    for raw in data.get("facets") or []:
        text = _normalise(raw.get("text") or "")
        if not text:
            continue
        facet = raw.get("facet") if raw.get("facet") in _VALID_FACETS else "interests"
        proposed_facets.append({"facet": facet, "text": text, "selected": True})

    signals = [
        {"term": _normalise(s.get("term") or ""), "direction": s.get("direction")}
        for s in (data.get("risk_signals") or [])
        if (s.get("term") or "").strip() and s.get("direction") in ("up", "down")
    ]

    return {
        "detected_topics": detected_topics,
        "proposed_edges": proposed_edges,
        "proposed_facets": proposed_facets,
        "risk_preview": preview_from_signals(signals),
    }


# --- extract (read-only) ----------------------------------------------------

def _keyword_extract(note: str) -> dict:
    """Deterministic, offline keyword extraction — the fallback when the LLM is off."""
    low = note.lower()
    detected_topics = [
        {"topic": key, "label": TOPIC_VOCAB[key].label}
        for key in classify_text(note)
        if key in TOPIC_VOCAB
    ]
    polarity, pol_cue = _polarity(low)
    facet, _facet_cue = _facet_guess(low)
    proposed_edges = [
        {
            "topic": t["topic"],
            "topic_label": t["label"],
            "facet": facet,
            "polarity": polarity,
            "rationale": _rationale(t["label"], polarity, pol_cue),
            "selected": True,
        }
        for t in detected_topics
    ]
    proposed_facets = [
        {"facet": facet, "text": text, "selected": True}
        for text in _first_sentences(note)
    ]
    return {
        "detected_topics": detected_topics,
        "proposed_edges": proposed_edges,
        "proposed_facets": proposed_facets,
        "risk_preview": score_note(note),
    }


def extract_draft(world, client_id: str, req: CaptureExtractRequest) -> dict:
    """Read-only staged draft (§2). No mutation.

    Prefers the LLM analysis (Phoeniqs) so paraphrased / free-form notes still yield
    topics, facets and risk cues; falls back to the deterministic keyword path when
    the LLM is disabled or unavailable."""
    note = _normalise(req.note)[:_NOTE_MAX]
    date = _resolve_date(req.date)
    modality = req.modality or "File Note"

    signals = _llm_extract(note) or _keyword_extract(note)

    return {
        "client_id": client_id,
        "note": note,
        "date": date,
        "modality": modality,
        "modality_icon": _modality_icon(modality),
        "contact": req.contact or "",
        "rm_name": req.rm_name or "",
        **signals,
        "preview_entry_id": _next_id(world, client_id, date),
    }


# --- apply (shared by confirm + replay) -------------------------------------

def _apply_capture(world, client_id: str, payload: dict, persist: bool = False) -> dict:
    """Materialise one confirmed payload into the live world. THE mutation.

    `persist=False` (the replay path) applies without re-writing the store, so boot
    replay never double-writes or grows the file. `confirm_capture` calls with
    `persist=True` exactly once.
    """
    note = _normalise(payload.get("note", ""))[:_NOTE_MAX]
    date = _resolve_date(payload.get("date", ""))
    modality = payload.get("modality") or "File Note"
    contact = payload.get("contact", "") or ""
    rm_name = payload.get("rm_name", "") or None

    entry_id = _next_id(world, client_id, date)
    prov = Provenance(
        source_type="crm_log",
        source_id=entry_id,
        excerpt=note[:200],
        timestamp=date,
    )

    risk_signals = [
        RiskSignal(term=_normalise(s.get("term", "")), direction=s.get("direction"))
        for s in (payload.get("risk_signals") or [])
        if _normalise(s.get("term", "")) and s.get("direction") in ("up", "down")
    ]

    entry = MeetingLogEntry(
        id=entry_id,
        client_id=client_id,
        timestamp=date,
        modality=modality,
        contact=contact,
        rm_name=rm_name,
        note=note,
        source=prov,
        risk_signals=risk_signals,
    )
    world.meeting_logs.setdefault(client_id, []).append(entry)

    profile = world.profiles.get(client_id)
    client_edges = world.interest_by_client.setdefault(client_id, [])
    # In the seed world `profile.interest_edges` IS the same list object as
    # `interest_by_client[client_id]`; only mirror into the profile list when it is
    # a distinct object, so a single edge isn't appended twice.
    profile_edges = profile.interest_edges if profile is not None else None
    mirror_to_profile = profile_edges is not None and profile_edges is not client_edges

    applied_edges = 0
    for raw in payload.get("edges", []) or []:
        if not raw.get("selected", True):
            continue
        topic = raw.get("topic")
        if topic not in TOPIC_VOCAB:  # drop unknown topics on confirm (§1)
            continue
        facet = raw.get("facet", "interests")
        if facet not in _VALID_FACETS:
            facet = "interests"
        polarity = raw.get("polarity", "neutral")
        if polarity not in ("conflict", "opportunity", "neutral"):
            polarity = "neutral"
        edge = InterestEdge(
            client_id=client_id,
            topic=topic,
            facet=facet,
            polarity=polarity,
            weight=1.0,
            provenance=prov,
        )
        client_edges.append(edge)
        if mirror_to_profile:
            profile_edges.append(edge)
        applied_edges += 1

    applied_facets = 0
    for raw in payload.get("facets", []) or []:
        if not raw.get("selected", True):
            continue
        text = _normalise(raw.get("text", ""))
        if not text:
            continue
        facet = raw.get("facet", "interests")
        if facet not in _VALID_FACETS:
            facet = "interests"
        if profile is not None:
            profile.facets.setdefault(facet, []).append(
                Statement(text=text, provenance=prov)
            )
        applied_facets += 1

    # Invalidate insights so the new edges flow into the next /insights (§2.4).
    world.insights_cache.pop(client_id, None)

    if persist:
        _append_store(_store_payload(client_id, payload, note, date, modality, contact, rm_name))

    return {
        "entry_id": entry_id,
        "applied": {"edges": applied_edges, "facets": applied_facets},
        "log_count": len(world.meeting_logs[client_id]),
    }


# --- write-through persistence ----------------------------------------------

def _store_payload(client_id, payload, note, date, modality, contact, rm_name) -> dict:
    """A self-contained, replayable record of one confirmed capture."""
    return {
        "client_id": client_id,
        "note": note,
        "date": date,
        "modality": modality,
        "contact": contact,
        "rm_name": rm_name or "",
        "edges": [
            {
                "topic": e.get("topic"),
                "topic_label": e.get("topic_label", ""),
                "facet": e.get("facet", "interests"),
                "polarity": e.get("polarity", "neutral"),
                "rationale": e.get("rationale", ""),
                "selected": e.get("selected", True),
            }
            for e in (payload.get("edges", []) or [])
        ],
        "facets": [
            {
                "facet": f.get("facet", "interests"),
                "text": f.get("text", ""),
                "selected": f.get("selected", True),
            }
            for f in (payload.get("facets", []) or [])
        ],
        "risk_signals": [
            {"term": s.get("term", ""), "direction": s.get("direction")}
            for s in (payload.get("risk_signals", []) or [])
        ],
    }


def _read_store() -> list[dict]:
    try:
        raw = json.loads(CAPTURED_PATH.read_text())
        return raw if isinstance(raw, list) else []
    except FileNotFoundError:
        return []
    except Exception:
        return []


def _append_store(record: dict) -> None:
    """Append one confirmed record to the JSON list, creating the file if missing."""
    records = _read_store()
    records.append(record)
    CAPTURED_PATH.parent.mkdir(parents=True, exist_ok=True)
    CAPTURED_PATH.write_text(json.dumps(records, ensure_ascii=False, indent=2))


# --- confirm (the only mutation entry point) --------------------------------

def confirm_capture(world, client_id: str, req: CaptureConfirmRequest) -> dict:
    """The RM gate — append the immutable log entry and materialise the kept
    edges/facets, then write through to the store exactly once (§2)."""
    payload = {
        "note": req.note,
        "date": req.date,
        "modality": req.modality,
        "contact": req.contact,
        "rm_name": req.rm_name,
        "edges": [e.model_dump() for e in req.edges],
        "facets": [f.model_dump() for f in req.facets],
        "risk_signals": [s.model_dump() for s in req.risk_signals],
    }
    result = _apply_capture(world, client_id, payload, persist=True)
    return {"ok": True, **result}


# --- replay on boot (no re-persist) -----------------------------------------

def replay_captures(world) -> int:
    """Replay every persisted capture into the world WITHOUT re-persisting. Guarded so
    a malformed file never crashes boot. Returns the number of records applied."""
    applied = 0
    try:
        records = _read_store()
    except Exception:
        return 0
    for record in records:
        try:
            client_id = record.get("client_id")
            if not client_id or client_id not in world.clients:
                continue
            _apply_capture(world, client_id, record, persist=False)
            applied += 1
        except Exception:
            # one bad record must never crash boot; skip it
            continue
    return applied


# --- guided capture prompts (client-aware "pseudo-interview") ---------------
# A deterministic, read-only set of quest prompts that scaffold a richer voice/
# text log. Client-aware: it asks whether the client's KNOWN positions have
# shifted, then covers risk, life, holdings, values and follow-ups. No mutation.

_STANCE_PHRASE = {
    "opportunity": "on record as keen to back it",
    "conflict": "on record as wanting to avoid it",
    "neutral": "on record as watching it",
}


def _first_name(name: str) -> str:
    return (name or "").strip().split(" ")[0] or "the client"


def build_capture_prompts(world, client_id: str) -> dict:
    """Client-aware quest prompts that guide the RM toward the best CRM log.
    Read-only, deterministic, no LLM."""
    name = world.clients.get(client_id, {}).get("name", "the client")
    first = _first_name(name)

    prompts: list[dict] = [{
        "id": "opener",
        "kind": "opener",
        "question": f"What did you cover with {first} today — the headline of the conversation?",
        "hint": "One or two sentences on the main thing you discussed.",
    }]

    # Position-change prompts for the client's KNOWN interest topics (deduped, capped at 3).
    seen: set[str] = set()
    for edge in world.interest_by_client.get(client_id, []):
        label = TOPIC_VOCAB[edge.topic].label if edge.topic in TOPIC_VOCAB else edge.topic
        if label in seen:
            continue
        seen.add(label)
        stance = _STANCE_PHRASE.get(edge.polarity, "on record as watching it")
        prompts.append({
            "id": f"position-{edge.topic}",
            "kind": "position",
            "question": f"Has {first}'s position on {label} shifted at all?",
            "hint": f"They are {stance}.",
        })
        if len(seen) >= 3:
            break

    prompts.extend([
        {
            "id": "risk",
            "kind": "risk",
            "question": f"Any change in {first}'s risk appetite, liquidity needs, or time horizon?",
            "hint": "Cautious vs. opportunistic; any cash call or withdrawal coming up.",
        },
        {
            "id": "life",
            "kind": "life",
            "question": "Any personal, family or business news?",
            "hint": "Health, succession, a big purchase or a liquidity event.",
        },
        {
            "id": "holdings",
            "kind": "holdings",
            "question": f"Did {first} raise any specific holding, sector, or recent market move?",
            "hint": "A concern, fresh interest, or a name to watch.",
        },
        {
            "id": "values",
            "kind": "values",
            "question": f"Anything new on what {first} cares about — values, causes, red lines?",
            "hint": "What they want to back, and what they refuse to hold.",
        },
        {
            "id": "closer",
            "kind": "closer",
            "question": "What did you agree, and what is the next follow-up?",
            "hint": "Commitments made and the next step you owe them.",
        },
    ])

    return {
        "client_id": client_id,
        "client_name": name,
        "first_name": first,
        "prompts": prompts,
    }

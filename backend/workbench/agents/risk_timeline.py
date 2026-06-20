"""Risk Timeline builder (RISK_TIMELINE_CONTRACT §2).

Replays a client's CRM meeting log chronologically and scores how their **risk
appetite** moved at each line, against a deterministic lexicon (no LLM, §9). Every
point carries the entry's own `source` Provenance (CLAUDE.md §2: if you can't cite
it, don't surface it) and tracks the **mandate fit** — appetite vs the mandate's
risk band — over time.

The risk axis runs 0.0 (max-defensive) … 1.0 (max risk-on). We start each client
at their mandate baseline and accrue per-entry deltas from matched terms, clamped
so one chatty note can't swing the line. Accrual counts (interest edges / profile
facets learned by each date) ride along so the scrubber can show what the desk knew
when.
"""
from __future__ import annotations

import re
from typing import Optional

from ..graph.store import World
from ..models import InterestEdge, MeetingLogEntry, Provenance, Statement

# --- mandate baselines + risk bands (deterministic) -------------------------

BASELINE: dict[str, float] = {"Defensive": 0.30, "Balanced": 0.55, "Growth": 0.78}

# Fixed visual bands for the chart (independent of the client's own baseline band).
BANDS: list[dict] = [
    {"id": "defensive", "label": "Defensive", "lo": 0.0, "hi": 0.40},
    {"id": "balanced", "label": "Balanced", "lo": 0.40, "hi": 0.66},
    {"id": "growth", "label": "Growth", "lo": 0.66, "hi": 1.0},
]

# --- scoring lexicon (§2) ---------------------------------------------------
# Matched case-insensitively as word-ish substrings on the note. Each distinct
# matched term contributes its weight to that entry's delta. Terms are tiered:
# "normal" cues nudge the line; "strong" cues (bullish/bearish, aggressive,
# panic, all-in …) swing it hard so a clear conviction statement really moves it.

_DE_RISK_WEIGHT = -0.07
_RISK_ON_WEIGHT = +0.07
_STRONG_DE_RISK_WEIGHT = -0.16
_STRONG_RISK_ON_WEIGHT = +0.16

DE_RISK_TERMS: list[str] = [
    "averse", "cautious", "caution", "cautiously", "conservative", "defensive",
    "preserve", "preservation", "protect", "protection", "nervous", "worried",
    "anxious", "divest", "reduce", "trim", "exit", "de-risk", "derisk", "de-risking",
    "drawdown", "hedge", "stability", "stable", "safety", "safe", "secure", "withdraw",
    "liquidity", "cash", "sell", "concerned", "uneasy", "wary", "prudent", "prudence",
    "risk-averse", "play it safe", "playing it safe", "shield", "shielded",
    "capital preservation", "preserve capital", "protect capital", "diversify",
    "lower risk", "reduce risk", "downside protection", "rainy day", "nest egg",
    "patient capital", "long horizon", "long-term", "sleep at night", "volatile",
    "volatility", "downturn", "recession", "pull back", "pare back", "lighten",
    "take profits", "income", "bonds", "fixed income", "rebalance toward bonds",
    "careful", "carefully", "steady", "low risk",
]

RISK_ON_TERMS: list[str] = [
    "aggressive", "growth", "opportunity", "opportunistic", "increase", "add to",
    "overweight", "speculative", "leverage", "ambitious", "conviction", "reinvest",
    "equity sleeve", "expand", "upside", "venture",
    "high-conviction", "appetite for", "comfortable with risk", "buy",
    "risk appetite", "more equity", "more equities", "growth stocks",
    "more risk", "higher return", "higher returns", "chase returns", "tactical tilt",
    "tilt toward", "concentrate", "concentrated", "lean in", "lean into",
    "compounding", "momentum", "rally", "buy the dip", "deploy cash", "deploy",
    "put money to work", "scale in", "build a position", "keen to invest",
    "ambition", "punchy", "swing for", "take more risk",
]

# Strong cues — roughly double weight. Clear, unambiguous conviction language.
STRONG_DE_RISK_TERMS: list[str] = [
    "bearish", "very cautious", "extremely cautious", "deeply worried", "panic",
    "panicking", "crash", "crashing", "dump", "dump everything", "sell everything",
    "get out", "capitulate", "risk-off", "flight to safety", "all to cash",
    "terrified", "scared", "petrified", "no appetite", "slash exposure",
    "pull everything", "head for the exit", "bail out",
]

STRONG_RISK_ON_TERMS: list[str] = [
    "bullish", "very bullish", "extremely bullish", "super bullish", "all-in",
    "all in", "go all in", "max risk", "maximum risk", "load up", "back up the truck",
    "aggressively buy", "huge conviction", "bet big", "swing for the fences",
    "fearless", "euphoric", "high risk", "lots of risk", "double down",
    "go aggressive", "go big", "lever up", "high octane", "risk-on",
]

# Cap on a single entry's swing so one chatty note can't dominate, but wide
# enough that strong conviction language produces a visible jump (§2).
_DELTA_CAP = 0.35
_SCORE_LO = 0.05
_SCORE_HI = 0.95
_BAND_HALF = 0.12  # mandate band half-width around the baseline

_EXCERPT_LEN = 160


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _round3(value: float) -> float:
    return round(value, 3)


def _compile(terms: list[str], direction: str, weight: float) -> list[tuple[re.Pattern, str, str, float]]:
    """Pre-compile each term as a word-ish boundary regex (case-insensitive)."""
    out: list[tuple[re.Pattern, str, str, float]] = []
    for term in terms:
        # \b doesn't play well with hyphens / multi-word phrases, so we anchor on a
        # non-word boundary at each end of the escaped term.
        pat = re.compile(r"(?<!\w)" + re.escape(term) + r"(?!\w)", re.IGNORECASE)
        out.append((pat, term, direction, weight))
    return out


# Strong cues are compiled FIRST so a phrase like "very bullish" matches the
# strong term before the normal "bullish"/"buy" substring would.
_LEXICON: list[tuple[re.Pattern, str, str, float]] = (
    _compile(STRONG_DE_RISK_TERMS, "down", _STRONG_DE_RISK_WEIGHT)
    + _compile(STRONG_RISK_ON_TERMS, "up", _STRONG_RISK_ON_WEIGHT)
    + _compile(DE_RISK_TERMS, "down", _DE_RISK_WEIGHT)
    + _compile(RISK_ON_TERMS, "up", _RISK_ON_WEIGHT)
)

# Substring sets for weighting signals that arrive without a precomputed weight
# (the LLM / preview path supplies term + direction only).
_STRONG_DOWN = [t.lower() for t in STRONG_DE_RISK_TERMS]
_STRONG_UP = [t.lower() for t in STRONG_RISK_ON_TERMS]


def signal_weight(term: str, direction: str) -> float:
    """Weight for a term+direction signal, picking the strong tier when the term
    carries clear conviction language (bullish/bearish, all-in, panic …)."""
    low = (term or "").lower()
    if direction == "up":
        return _STRONG_RISK_ON_WEIGHT if any(s in low for s in _STRONG_UP) else _RISK_ON_WEIGHT
    if direction == "down":
        return _STRONG_DE_RISK_WEIGHT if any(s in low for s in _STRONG_DOWN) else _DE_RISK_WEIGHT
    return 0.0


def _excerpt(note: str) -> str:
    """A short, clean verbatim slice of a log note (<= ~160 chars)."""
    text = " ".join(note.split())
    if len(text) <= _EXCERPT_LEN:
        return text
    cut = text[:_EXCERPT_LEN]
    for sep in (". ", "; ", ", "):
        idx = cut.rfind(sep)
        if idx > 60:
            return cut[: idx + 1].rstrip()
    return cut.rsplit(" ", 1)[0].rstrip() + "…"


def _signals(note: str) -> list[dict]:
    """Distinct matched lexicon terms in a note, each as a signal dict.

    Distinct = one signal per term even if the term appears several times. Kept in
    lexicon order for stable, deterministic output."""
    seen: set[str] = set()
    out: list[dict] = []
    for pat, term, direction, weight in _LEXICON:
        if term in seen:
            continue
        if pat.search(note):
            seen.add(term)
            out.append({"term": term, "direction": direction, "weight": weight})
    return out


def _prov_dump(entry: MeetingLogEntry) -> dict:
    """The entry's own source Provenance, as a plain JSON-serialisable dict."""
    return entry.source.model_dump()


def _entry_signals(entry: MeetingLogEntry) -> list[dict]:
    """Signals for an entry: the risk cues the analysis stored at capture time (so
    paraphrased notes still register), falling back to the keyword lexicon for seed
    entries and any note captured without an analysis."""
    stored = getattr(entry, "risk_signals", None) or []
    if stored:
        return [
            {"term": s.term, "direction": s.direction, "weight": signal_weight(s.term, s.direction)}
            for s in stored
        ]
    return _signals(entry.note)


def score_note(note: str) -> dict:
    """Score a single note against the risk lexicon (§2), independent of a client's
    history. Reused by RM Capture to preview how a staged note will nudge the
    risk timeline. Returns `{delta, direction, signals:[{term, direction}]}` —
    `delta` is clamped to the same per-entry cap as the timeline, `signals` are
    the distinct matched lexicon terms (term + direction only, weights dropped for
    the preview)."""
    signals = _signals(note or "")
    raw_delta = sum(s["weight"] for s in signals)
    delta = _clamp(raw_delta, -_DELTA_CAP, _DELTA_CAP)
    if delta > 0.001:
        direction = "up"
    elif delta < -0.001:
        direction = "down"
    else:
        direction = "flat"
    return {
        "delta": _round3(delta),
        "direction": direction,
        "signals": [{"term": s["term"], "direction": s["direction"]} for s in signals],
    }


def preview_from_signals(signals: list[dict]) -> dict:
    """Build a `score_note`-shaped preview from already-classified signals — e.g. an
    LLM extraction that named the risk cues itself. `signals` are `{term, direction}`
    dicts (`direction` in {"up","down"}; others ignored). Reuses the same per-cue
    weights and per-entry cap as the keyword path so the preview stays consistent
    with the timeline."""
    weighted: list[dict] = []
    for s in signals or []:
        direction = s.get("direction")
        if direction not in ("up", "down"):
            continue
        term = (s.get("term") or "").strip()
        if not term:
            continue
        weighted.append({"term": term, "direction": direction, "weight": signal_weight(term, direction)})
    delta = _clamp(sum(s["weight"] for s in weighted), -_DELTA_CAP, _DELTA_CAP)
    if delta > 0.001:
        direction = "up"
    elif delta < -0.001:
        direction = "down"
    else:
        direction = "flat"
    return {
        "delta": _round3(delta),
        "direction": direction,
        "signals": [{"term": s["term"], "direction": s["direction"]} for s in weighted],
    }


# --- accrual: what the desk knew by each date -------------------------------

def _edge_dates(edges: list[InterestEdge]) -> list[str]:
    """Sorted list of interest-edge provenance timestamps (skipping nulls)."""
    return sorted(e.provenance.timestamp for e in edges if e.provenance and e.provenance.timestamp)


def _facet_statements(world: World, client_id: str) -> list[tuple[str, Statement]]:
    """(facet_name, Statement) pairs from the profile that carry a timestamp."""
    profile = world.profiles.get(client_id)
    if not profile:
        return []
    out: list[tuple[str, Statement]] = []
    for facet_name, stmts in profile.facets.items():
        for stmt in stmts or []:
            if stmt.provenance and stmt.provenance.timestamp:
                out.append((facet_name, stmt))
    return out


def _count_by_date(timestamps: list[str], on_or_before: str) -> int:
    return sum(1 for t in timestamps if t <= on_or_before)


def build_risk_timeline(world: World, client_id: str) -> dict:
    """Build the chronological risk-appetite timeline for a client (§2).

    Returns the RiskTimeline shape as a plain dict (snake_case), ready for the API.
    Deterministic — no LLM, no per-client model call."""
    meta = world.clients.get(client_id, {})
    name = meta.get("name") or (
        world.profiles[client_id].name if client_id in world.profiles else client_id
    )
    mandate = meta.get("mandate") or (
        world.profiles[client_id].mandate if client_id in world.profiles else "Balanced"
    )
    baseline = BASELINE.get(mandate, 0.55)

    lo, hi = baseline - _BAND_HALF, baseline + _BAND_HALF
    band = {"lo": _round3(lo), "hi": _round3(hi), "label": mandate}

    # raw history, sorted ascending by timestamp (§2)
    logs = sorted(world.meeting_logs.get(client_id, []), key=lambda e: e.timestamp)

    # accrual sources
    edges = world.interest_by_client.get(client_id, [])
    edge_dates = _edge_dates(edges)
    facet_stmts = _facet_statements(world, client_id)
    facet_dates = [s.provenance.timestamp for _, s in facet_stmts]

    points: list[dict] = []
    prev_score = baseline
    prev_fit: Optional[str] = None

    for entry in logs:
        date = entry.timestamp
        signals = _entry_signals(entry)

        raw_delta = sum(s["weight"] for s in signals)
        delta = _clamp(raw_delta, -_DELTA_CAP, _DELTA_CAP)
        score = _clamp(prev_score + delta, _SCORE_LO, _SCORE_HI)

        if delta > 0.001:
            direction = "up"
        elif delta < -0.001:
            direction = "down"
        else:
            direction = "flat"

        mandate_gap = _round3(score - baseline)
        if score < lo:
            mandate_fit = "cautious-drift"
        elif score > hi:
            mandate_fit = "risk-on-drift"
        else:
            mandate_fit = "aligned"

        # what the desk knew by this date
        edges_known = _count_by_date(edge_dates, date)
        facets_known = _count_by_date(facet_dates, date)
        facet_changes = [
            {"facet": fname, "text": stmt.text}
            for fname, stmt in facet_stmts
            if stmt.provenance.timestamp == date
        ]

        points.append({
            "id": entry.id,
            "date": date,
            "modality": entry.modality,
            "contact": entry.contact,
            "note_excerpt": _excerpt(entry.note),
            "risk_score": _round3(score),
            "delta": _round3(delta),
            "direction": direction,
            "risk_relevant": bool(signals),
            "signals": signals,
            "mandate_gap": mandate_gap,
            "mandate_fit": mandate_fit,
            "edges_known": edges_known,
            "facets_known": facets_known,
            "facet_changes": facet_changes,
            "provenance": _prov_dump(entry),
        })

        prev_score = score
        prev_fit = mandate_fit  # noqa: F841  (kept for parity; crossings computed below)

    milestones = _milestones(points)

    return {
        "client_id": client_id,
        "client_name": name,
        "mandate": mandate,
        "baseline": _round3(baseline),
        "band": band,
        "bands": [dict(b) for b in BANDS],
        "start_date": points[0]["date"] if points else None,
        "end_date": points[-1]["date"] if points else None,
        "points": points,
        "milestones": milestones,
        "current": points[-1] if points else None,
    }


def _milestone_label(point: dict, kind: str) -> str:
    """A short, human label for a milestone, grounded in the point itself."""
    if kind == "start":
        return "Mandate baseline"
    if kind == "crossing":
        fit = point["mandate_fit"]
        if fit == "cautious-drift":
            return "Drifts defensive"
        if fit == "risk-on-drift":
            return "Drifts risk-on"
        return "Back in mandate band"
    # spike
    arrow = "Risk-on" if point["direction"] == "up" else "De-risking"
    lead = next((s["term"] for s in point["signals"]), "")
    return f"{arrow} signal" + (f" · {lead}" if lead else "")


def _milestones(points: list[dict]) -> list[dict]:
    """Up to 4 biggest |delta| spikes, plus mandate-fit crossings, plus the first
    point. Deduped by point id, ordered chronologically (§2)."""
    if not points:
        return []

    chosen: dict[str, dict] = {}

    # first point — the mandate baseline anchor
    first = points[0]
    chosen[first["id"]] = {
        "point_id": first["id"],
        "label": _milestone_label(first, "start"),
        "kind": "start",
    }

    # mandate-fit crossings (where the fit changed from the previous point)
    prev_fit = points[0]["mandate_fit"]
    for pt in points[1:]:
        if pt["mandate_fit"] != prev_fit:
            chosen.setdefault(pt["id"], {
                "point_id": pt["id"],
                "label": _milestone_label(pt, "crossing"),
                "kind": "crossing",
            })
        prev_fit = pt["mandate_fit"]

    # up to 4 largest |delta| spikes
    spikes = sorted(
        (p for p in points if abs(p["delta"]) > 0.001),
        key=lambda p: (-abs(p["delta"]), p["date"]),
    )[:4]
    for pt in spikes:
        chosen.setdefault(pt["id"], {
            "point_id": pt["id"],
            "label": _milestone_label(pt, "spike"),
            "kind": "spike",
        })

    # chronological order by point position
    order = {p["id"]: i for i, p in enumerate(points)}
    return sorted(chosen.values(), key=lambda m: order[m["point_id"]])

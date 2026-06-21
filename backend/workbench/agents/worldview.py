"""The Worldview Engine (CLAUDE.md §1/§8.D) — the differentiator.

Every other approach reduces the client to a topic set the instant matching happens. We refuse to:
each signal is scored, reframed and reacted-to through a living model of the client's worldview —
their CONVICTIONS (weighted, corroborated, dated interest edges), their EXPOSURE (the portfolio),
their MEMORY (their own past words), and their predicted REACTION.

Five capabilities, all fully cited (Trust, §2):
  1. Client Lens         — reframe(): the same news, rewritten through THIS client's documented words.
  2. Conviction Score    — score_match(): a transparent 0–100 relevance, every term cited.
  3. Reaction Simulator  — predict_reaction(): how the client will react, so the RM walks in prepared.
  4. Celebrate lane      — is_celebrate(): a genuine 'call to celebrate' good-news moment, not a warning.
  5. Life-event timing   — detect_life_events(): dated values shifts vs today — the human moment.

Token discipline (§9): 1, 2, 4, 5 are DETERMINISTIC and free — they run at match time for every
client (and stay correct offline). Only 3 spends the strong model, lazily, on the opened client's
primary match, with a deterministic fallback. Advisory only (§2): the engine prepares the RM; it
never speaks to the client and never places a trade.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from ..graph.store import World
from ..models import (
    InterestEdge,
    LensFraming,
    LifeEventSignal,
    Match,
    Provenance,
    ReactionPrediction,
    RelevanceScore,
    ScoreComponent,
)
from ..topics import topic_label
from . import llm
from .advisory import _tone

# --- small date helpers (backend formats plainly; the UI re-formats as it likes) ---------------

_MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _clamp01(x: float) -> float:
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def _parse_date(s: Optional[str]) -> Optional[date]:
    try:
        return date.fromisoformat((s or "")[:10])
    except Exception:
        return None


def _fmt_date(s: Optional[str]) -> str:
    d = _parse_date(s)
    return f"{d.day} {_MONTHS[d.month]} {d.year}" if d else (s or "")


def _age_days(published: Optional[str]) -> Optional[int]:
    d = _parse_date(published)
    return (_today() - d).days if d else None


def _age_label(published: Optional[str]) -> str:
    age = _age_days(published)
    if age is None:
        return "recent"
    if age <= 0:
        return "today"
    if age == 1:
        return "yesterday"
    if age < 14:
        return f"{age} days ago"
    if age < 60:
        return f"{age // 7} weeks ago"
    return f"{age // 30} months ago"


def _months_between(d: date, today: date) -> int:
    return (today.year - d.year) * 12 + (today.month - d.month) - (1 if today.day < d.day else 0)


def _first_name(world: World, client_id: str) -> str:
    meta = world.clients.get(client_id, {})
    name = meta.get("name") or client_id
    parts = name.split()
    return parts[0] if parts else name


# --- the conviction edge: the client's strongest documented stance behind this match -----------

def _conviction_edge(world: World, client_id: str, match: Match) -> Optional[InterestEdge]:
    """The interest edge that best explains this match for this client — preferring the one whose
    polarity matches the decision (mirrors matcher's citation choice), then the heaviest and most
    corroborated. This is where the conviction (weight × log_support × facet) comes from."""
    edges = world.interest_by_client.get(client_id, [])
    shared = {st.topic for st in match.shared_topics}
    cands = [e for e in edges if e.topic in shared]
    if not cands:
        return None
    same = [e for e in cands if e.polarity == match.polarity]
    return max(same or cands, key=lambda e: (e.weight, e.log_support))


# --- #2: conviction-weighted relevance score (deterministic, fully cited) ----------------------

FACET_CONVICTION = {"personality": 1.0, "professional": 0.95, "historical": 0.85, "interests": 0.8}
# Point caps per factor — sum to 100. The breakdown (not the bare number) is the trust surface.
CONV_MAX, EXP_MAX, SENT_MAX, FRESH_MAX, SIGNAL_MAX = 35.0, 30.0, 20.0, 10.0, 5.0
# Exposure reaches full credit at ~5% of the mandate — a large single-name position.
EXP_FULL_SHARE = 0.05
FRESH_HALFLIFE_DAYS = 45.0
# Source credibility, lightly weighted (max 5pts). The marquee press wire and an official filing
# are both first-class signals; only soft macro/sentiment blurbs are discounted.
SIGNAL_TIER = {
    "news": 1.0, "sec_filing": 1.0, "earnings": 1.0, "esg": 0.85, "analyst": 0.85,
    "insider": 0.7, "macro": 0.4,
}


def score_match(world: World, client_id: str, match: Match) -> RelevanceScore:
    """A transparent 0–100 for THIS (client, item): conviction + exposure + news strength +
    freshness + signal tier. Every component carries the source behind it (§2)."""
    comps: list[ScoreComponent] = []

    edge = _conviction_edge(world, client_id, match)
    base = FACET_CONVICTION.get(edge.facet, 0.8) if edge else 0.55
    conv = _clamp01(
        base
        + 0.10 * ((edge.weight if edge else 1.0) - 1.0)
        + 0.05 * ((edge.log_support if edge else 1) - 1)
    )
    conv_detail = (
        f"{edge.facet} conviction"
        + (f" · corroborated ×{edge.log_support} in the logs" if edge and edge.log_support > 1 else "")
    ) if edge else "topic interest"
    comps.append(ScoreComponent(
        label="Conviction", detail=conv_detail,
        points=round(CONV_MAX * conv, 1), max_points=CONV_MAX,
        provenance=(edge.provenance if edge else None),
    ))

    aff = match.affected_holding
    if aff is not None:
        mand = world.mandates.get(world.portfolio_of(client_id))
        total = (mand.total_chf if mand and mand.total_chf else 0.0) \
            or sum(h.current_chf for h in world.holdings_for_client(client_id)) or 1.0
        share = (aff.current_chf or 0.0) / total
        comps.append(ScoreComponent(
            label="Exposure",
            detail=f"holds {aff.issuer} · {share * 100:.1f}% of the {aff.portfolio} mandate",
            points=round(EXP_MAX * _clamp01(share / EXP_FULL_SHARE), 1), max_points=EXP_MAX,
            provenance=aff.provenance,
        ))
    else:
        comps.append(ScoreComponent(
            label="Exposure", detail="no direct position — thematic signal",
            points=0.0, max_points=EXP_MAX, provenance=None,
        ))

    s = match.news.sentiment
    comps.append(ScoreComponent(
        label="News strength", detail=f"{s.label} · score {s.score:+.2f}",
        points=round(SENT_MAX * _clamp01(abs(s.score or 0.0)), 1), max_points=SENT_MAX,
        provenance=match.news.provenance,
    ))

    age = _age_days(match.news.published_at)
    fresh = 1.0 if (age is None or age < 0) else _clamp01(1 - age / FRESH_HALFLIFE_DAYS)
    comps.append(ScoreComponent(
        label="Freshness", detail=_age_label(match.news.published_at),
        points=round(FRESH_MAX * fresh, 1), max_points=FRESH_MAX,
        provenance=match.news.provenance,
    ))

    tier = SIGNAL_TIER.get(match.news.signal_type or "news", 0.6)
    comps.append(ScoreComponent(
        label="Signal", detail=f"{match.news.signal_type or 'news'} source",
        points=round(SIGNAL_MAX * tier, 1), max_points=SIGNAL_MAX,
        provenance=match.news.provenance,
    ))

    score = int(max(0, min(100, round(sum(c.points for c in comps)))))
    summary = " + ".join(f"{c.label} {c.points:g}" for c in comps) + f" = {score}/100"
    return RelevanceScore(score=score, components=comps, summary=summary)


# --- #1: the Client Lens — the news rewritten through this client's own words -------------------

def reframe(world: World, client_id: str, match: Match) -> Optional[LensFraming]:
    """Render the generic news through THIS client's documented worldview, quoting their own prior
    words back to them. Deterministic so it survives offline; the juxtaposition (their quote vs the
    headline) is the wow — and both sides are cited (§2)."""
    if client_id not in world.profiles:
        return None
    first = _first_name(world, client_id)
    edge = _conviction_edge(world, client_id, match)
    quote = edge.provenance.excerpt if edge and edge.provenance else None
    qdate = edge.provenance.timestamp if edge and edge.provenance else None
    issuer = match.news.issuer_name or "A market signal"
    labels = ", ".join(dict.fromkeys(topic_label(t.topic) for t in match.shared_topics)) or "his priorities"

    if match.polarity == "conflict":
        headline = f"For {first}, this isn't market noise — it's the line he asked us never to cross."
    elif match.celebrate or match.polarity == "opportunity":
        headline = f"For {first}, this is exactly the impact his capital is meant to back."
    else:
        headline = f"For {first}, this touches a theme he has told us he watches."

    if quote:
        narrative = (f"He told us on {_fmt_date(qdate)}: “{quote}” "
                     f"Today's signal — “{match.news.title}” — lands on exactly that.")
    elif edge is not None:
        narrative = (f"{issuer} has moved on {labels} — which {first} has documented with us as "
                     f"a {edge.facet} priority.")
    else:
        narrative = f"{issuer} has moved on {labels} — a theme on {first}'s watch-list."

    prov: list[Provenance] = []
    if edge and edge.provenance:
        prov.append(edge.provenance)
    prov.append(match.news.provenance)
    return LensFraming(headline=headline, narrative=narrative, client_quote=quote,
                       quote_date=qdate, draft_source="template", provenance=prov)


# --- #4: the Celebrate lane — a genuine good-news call, not a warning ---------------------------

def is_celebrate(match: Match, topic_edges: list[InterestEdge]) -> bool:
    """True when a held/approved name did something the client explicitly asked to HEAR ABOUT and
    celebrate — an opportunity edge + bullish news. Lets the desk phone with good news, not only
    when a stock drops (Huber: 'call me when a company does something magnificent')."""
    return (
        match.polarity == "opportunity"
        and match.news.sentiment.label == "BULLISH"
        and any(e.polarity == "opportunity" for e in topic_edges)
    )


# --- #5: life-event-aware timing — mine the dates, notice the human moment ----------------------

WINDOW_MONTHS = 12
# cue -> human label for the banner. Ordered: the most specific life events win.
LIFE_CUES: list[tuple[str, str]] = [
    ("diagnos", "Recent diagnosis in the family"),
    ("passed away", "Bereavement in the family"),
    ("bereave", "Bereavement in the family"),
    ("inherit", "Inheritance event"),
    ("endowment", "New philanthropic commitment"),
    ("foundation", "New philanthropic commitment"),
    ("grant", "New philanthropic commitment"),
    ("retire", "Retirement transition"),
    ("born", "New child in the family"),
    ("grandchild", "New grandchild"),
    ("married", "Marriage"),
    ("divorce", "Family change"),
]


def _life_implication(world: World, client_id: str, topic: Optional[str], facet: Optional[str],
                      months: int) -> str:
    mandate = world.clients.get(client_id, {}).get("mandate", "")
    ago = "this month" if months <= 0 else f"{months} month{'s' if months != 1 else ''} ago"
    if topic:
        return (f"His conviction on {topic_label(topic)} was logged {ago} — verify the {mandate} "
                f"mandate still reflects what matters to him now.")
    return (f"Logged {ago}: a shift in his {facet or 'priorities'} — check the {mandate} mandate and "
            f"your talking points still fit who he is today.")


def detect_life_events(world: World, client_id: str) -> list[LifeEventSignal]:
    """Recent dated events/belief-shifts (within a year) that reshaped the client's priorities. Real
    life cues (a diagnosis, an endowment) win over generic shifts; each is cited to the log line."""
    profile = world.profiles.get(client_id)
    if not profile:
        return []
    today = _today()

    candidates: list[tuple[bool, str, LifeEventSignal]] = []  # (is_cued, date_iso, signal)
    seen: set = set()

    # (timestamp, text, facet, topic, origin, provenance)
    items: list[tuple[Optional[str], str, Optional[str], Optional[str], str, Provenance]] = []
    for facet_name, statements in profile.facets.items():
        for st in statements:
            items.append((st.provenance.timestamp, st.text, facet_name, None, st.origin, st.provenance))
    for e in profile.interest_edges:
        items.append((e.provenance.timestamp, e.provenance.excerpt, e.facet, e.topic, e.origin, e.provenance))

    for ts, text, facet, topic, origin, prov in items:
        d = _parse_date(ts)
        if not d:
            continue
        months = _months_between(d, today)
        if months < 0 or months > WINDOW_MONTHS:
            continue
        low = (text or "").lower()
        label = next((lbl for cue, lbl in LIFE_CUES if cue in low), None)
        is_cued = label is not None
        is_shift = facet in ("personality", "interests", "historical")
        if not label and not is_shift:
            continue
        # Curated (seed) shifts are high-quality ground truth; an auto-derived (log/capture) item
        # only earns a banner when it carries a real life cue — keeps the signal from going noisy.
        if not is_cued and origin != "seed":
            continue
        if not label:
            label = "Recent shift in stated priorities"
        key = (d.isoformat(), label)
        if key in seen:
            continue
        seen.add(key)
        candidates.append((is_cued, d.isoformat(), LifeEventSignal(
            label=label, date=d.isoformat(), months_ago=max(0, months), topic=topic, facet=facet,
            implication=_life_implication(world, client_id, topic, facet, max(0, months)),
            provenance=prov,
        )))

    # cued life events first, then most recent; keep the two most resonant.
    candidates.sort(key=lambda c: (c[0], c[1]), reverse=True)
    return [sig for _cued, _d, sig in candidates[:2]]


# --- #3: the Reaction Simulator — predict the client's reaction so the RM is prepared ----------

def _reaction_template(tone: str, match: Match, first: str) -> dict:
    """Deterministic, advisory-only fallback: what reaction the RM should EXPECT, by (tone, polarity).
    Never speaks to the client; it prepares the RM and points at the proposed, in-rails response."""
    positive = match.polarity == "opportunity" or match.celebrate
    if positive:
        by_tone = {
            "values": dict(
                objection="“Why didn't we already own more of this? I want to back it properly.”",
                register="proud · energised",
                rebuttal="Celebrate the win first, then walk him through the drift-safe overweight that "
                         "raises exposure within his mandate.",
            ),
            "empathetic": dict(
                objection="“Is this hope real, or just a headline?”",
                register="hopeful · personally invested",
                rebuttal="Confirm it's a held name acting on the cause closest to him, cite the source, "
                         "and keep it human before the numbers.",
            ),
        }
        return by_tone.get(tone, dict(
            objection="“Good — so what do we do to lean into it?”",
            register="positive",
            rebuttal="Surface the values-aligned overweight or hold, cited to the CIO list, within mandate.",
        ))

    by_tone = {
        "conservative": dict(
            objection="“This is exactly the speculative move I asked you to keep me out of — "
                      "I want quiet and predictable.”",
            register="wary · wants reassurance",
            rebuttal="Lead with capital preservation: stress the defensive allocation is untouched and "
                     "route any required exposure through the tangible names he already respects.",
        ),
        "analytical": dict(
            objection="“Show me the data — why is this a live risk, not a backward-looking score?”",
            register="sceptical · wants evidence",
            rebuttal="Open with the live operational/reputational facts and the substitution metrics; "
                     "frame it as tail-risk management, not values signalling.",
        ),
        "empathetic": dict(
            objection="“Does this really protect what matters to us, or are we just reacting?”",
            register="anxious · personally invested",
            rebuttal="Acknowledge the human stake first, then show the same-sector, values-aligned "
                     "option that keeps the strategy steady.",
        ),
        "values": dict(
            objection="“I don't want my capital anywhere near this — how did we end up holding it?”",
            register="disappointed · principled",
            rebuttal="Validate the principle, show the divest-and-replace into a documented leader, and "
                     "confirm the values screen is now enforced.",
        ),
    }
    return by_tone.get(tone, dict(
        objection=f"“Walk me through why this matters for my portfolio, {first} aside.”",
        register="measured",
        rebuttal="Give the one-line risk, the same-sector CIO-approved fix, and the mandate check.",
    ))


def predict_reaction(world: World, client_id: str, match: Match) -> "tuple[ReactionPrediction, bool]":
    """Forecast how the client will react to the primary proposal, grounded in their personality and
    their own past words. Strong model lazily (§9) with a deterministic fallback; returns (pred,
    llm_used). Advisory only — it prepares the RM, it does not speak to the client (§2)."""
    seed = world.clients.get(client_id, {})
    style = seed.get("style", "")
    name = seed.get("name", client_id)
    first = _first_name(world, client_id)
    tone = _tone(style)

    edge = _conviction_edge(world, client_id, match)
    quote = edge.provenance.excerpt if edge and edge.provenance else None
    profile = world.profiles.get(client_id)
    persona_quote = None
    persona_prov: Optional[Provenance] = None
    if profile:
        for st in profile.facets.get("personality", []):
            persona_quote, persona_prov = st.text, st.provenance
            break

    prov: list[Provenance] = []
    if edge and edge.provenance:
        prov.append(edge.provenance)
    if persona_prov is not None:
        prov.append(persona_prov)
    confidence = "grounded" if (quote or persona_quote) else "inferred"

    det = _reaction_template(tone, match, first)
    pred = ReactionPrediction(
        predicted_objection=det["objection"], emotional_register=det["register"],
        suggested_rebuttal=det["rebuttal"], confidence=confidence, draft_source="template",
        provenance=prov,
    )
    llm_used = False
    if llm.llm_available():
        data = llm.chat_json(
            system=(
                "You are preparing a Swiss relationship manager for a client conversation. Predict how "
                "THIS client will REACT to the proposal so the RM is prepared. You advise the RM only: "
                "never speak to or as the client, never instruct a trade. Ground every line in the "
                "client's documented personality and their own past words. UK spelling. Output JSON with "
                "keys: predicted_objection (likely pushback, may echo their voice, <=40 words), "
                "emotional_register (<=6 words), suggested_rebuttal (how the RM should respond, <=45 words)."
            ),
            user=(
                f"Client: {name}\nStyle: {style}\n"
                f"Documented personality: {persona_quote or '(none on file)'}\n"
                f"Their own past words on this topic: “{quote or '(none on file)'}”\n"
                f"Situation (the trigger): {match.headline}\nPolarity: {match.polarity}."
            ),
            max_tokens=300,
        )
        if data and data.get("predicted_objection") and data.get("suggested_rebuttal"):
            pred = ReactionPrediction(
                predicted_objection=str(data["predicted_objection"])[:400],
                emotional_register=str(data.get("emotional_register") or det["register"])[:80],
                suggested_rebuttal=str(data["suggested_rebuttal"])[:500],
                confidence=confidence, draft_source="llm", provenance=prov,
            )
            llm_used = True
    return pred, llm_used

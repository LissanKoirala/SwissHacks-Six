"""Rendezvous planner (ported feature §1).

Turns the client's CRM history into a *next meeting* plan: the personal interests we can
cite, a handful of curated venue suggestions in and around Zurich, conversation openers, and
topics to steer around. Everything surfaced carries provenance back to a real meeting-log line
or profile facet — if we can't cite it, we don't suggest it (CLAUDE.md §2/§7.5).

This is a deterministic curator, not an LLM call (§9). Per-persona suggestions are hand-built
templates; each is *grounded* only when a real log excerpt backs it, otherwise *inferred*.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from ..graph.store import World
from ..models import MeetingLogEntry, Profile, Provenance

RendezvousKind = Literal[
    "dining", "sport", "culture", "outdoor", "family",
    "philanthropy", "wine", "travel", "other",
]
Confidence = Literal["grounded", "inferred"]

# How long an excerpt we lift verbatim from a log note for a citation.
_EXCERPT_LEN = 180


# --- output models (snake_case, mirrors lib/types Rendezvous) ----------------

class RendezvousInterest(BaseModel):
    id: str
    label: str
    category: RendezvousKind
    icon: str
    provenance: Optional[Provenance] = None


class RendezvousSuggestion(BaseModel):
    id: str
    kind: RendezvousKind
    icon: str
    title: str
    venue: str
    city: str
    when: str
    why: str
    matched_interest_ids: list[str] = Field(default_factory=list)
    prep: list[str] = Field(default_factory=list)
    confidence: Confidence = "inferred"
    provenance: list[Provenance] = Field(default_factory=list)


class RendezvousTalkingPoint(BaseModel):
    text: str
    provenance: Optional[Provenance] = None


class Rendezvous(BaseModel):
    client_id: str
    client_name: str
    interests: list[RendezvousInterest] = Field(default_factory=list)
    suggestions: list[RendezvousSuggestion] = Field(default_factory=list)
    talking_points: list[RendezvousTalkingPoint] = Field(default_factory=list)
    avoid: list[str] = Field(default_factory=list)


# --- log grounding helpers ---------------------------------------------------

def _logs(world: World, client_id: str) -> list[MeetingLogEntry]:
    return world.meeting_logs.get(client_id, [])


def _snippet(note: str) -> str:
    """A short, clean verbatim slice of a log note for a citation excerpt."""
    text = " ".join(note.split())
    if len(text) <= _EXCERPT_LEN:
        return text
    cut = text[:_EXCERPT_LEN]
    # prefer a sentence/clause boundary so the excerpt reads cleanly
    for sep in (". ", "; ", ", "):
        idx = cut.rfind(sep)
        if idx > 60:
            return cut[: idx + 1].rstrip()
    return cut.rsplit(" ", 1)[0] + "…"


def _prov_from_log(entry: MeetingLogEntry) -> Provenance:
    return Provenance(
        source_type="crm_log",
        source_id=entry.id,
        excerpt=_snippet(entry.note),
        timestamp=entry.timestamp,
    )


def _find_log(
    world: World, client_id: str, *needles: str
) -> Optional[MeetingLogEntry]:
    """Most recent log entry whose note contains all the given (case-insensitive) needles."""
    wants = [n.lower() for n in needles]
    hits = [
        e for e in _logs(world, client_id)
        if all(w in e.note.lower() for w in wants)
    ]
    return hits[-1] if hits else None


def _facet_prov(profile: Optional[Profile], facet: str) -> Optional[Provenance]:
    if not profile:
        return None
    stmts = profile.facets.get(facet) or []
    return stmts[0].provenance if stmts else None


# --- per-persona curation ----------------------------------------------------
#
# Each spec is (key, kind, icon, title, venue, city, when, why, interest_ids,
# prep, *log_needles). When the log needles resolve to a real entry the suggestion
# is "grounded" and carries that log's provenance; otherwise it is "inferred".

def _suggestions(
    world: World, client_id: str, specs: list[tuple]
) -> list[RendezvousSuggestion]:
    out: list[RendezvousSuggestion] = []
    for spec in specs:
        (key, kind, icon, title, venue, city, when, why,
         interest_ids, prep, *needles) = spec
        entry = _find_log(world, client_id, *needles) if needles else None
        prov = [_prov_from_log(entry)] if entry else []
        out.append(RendezvousSuggestion(
            id=f"{client_id}:rdv:{key}",
            kind=kind, icon=icon, title=title, venue=venue, city=city,
            when=when, why=why, matched_interest_ids=interest_ids, prep=prep,
            confidence="grounded" if entry else "inferred",
            provenance=prov,
        ))
    return out


def _interests(
    world: World, client_id: str, profile: Optional[Profile], specs: list[tuple]
) -> list[RendezvousInterest]:
    """specs: (id, label, category, icon, facet|None, *log_needles)."""
    out: list[RendezvousInterest] = []
    for iid, label, category, icon, facet, *needles in specs:
        prov: Optional[Provenance] = None
        entry = _find_log(world, client_id, *needles) if needles else None
        if entry:
            prov = _prov_from_log(entry)
        elif facet:
            prov = _facet_prov(profile, facet)
        out.append(RendezvousInterest(
            id=iid, label=label, category=category, icon=icon, provenance=prov,
        ))
    return out


def _talking_points(
    world: World, client_id: str, specs: list[tuple]
) -> list[RendezvousTalkingPoint]:
    """specs: (text, *log_needles)."""
    out: list[RendezvousTalkingPoint] = []
    for text, *needles in specs:
        entry = _find_log(world, client_id, *needles) if needles else None
        out.append(RendezvousTalkingPoint(
            text=text,
            provenance=_prov_from_log(entry) if entry else None,
        ))
    return out


# --- the four personas -------------------------------------------------------

def _build_raeber(world: World, p: Optional[Profile]) -> Rendezvous:
    cid = "raeber"
    interests = _interests(world, cid, p, [
        ("traditional", "Traditional Swiss values", "dining", "🫕",
         "personality", "traditional"),
        ("hardware", "Engineering & hardware", "culture", "⚙️",
         "interests", "siemens", "asml"),
        ("classical", "Quiet, classical tastes", "culture", "🎻",
         "personality", "quiet", "predictable"),
        ("mountains", "Flims & the mountains", "outdoor", "🏔️",
         None, "flims"),
        ("dividends", "Dependable dividends", "other", "💰",
         None, "dividend", "nestlé"),
        ("succession", "Wealth for the grandchildren", "family", "👪",
         None, "grandchildren"),
    ])
    suggestions = _suggestions(world, cid, [
        ("kronenhalle", "dining", "🍽️", "Lunch at the Kronenhalle",
         "Kronenhalle", "Zürich", "Weekday, 12:30",
         "A Zürich institution — old-world, discreet and utterly dependable, the kind of "
         "tangible quality Eugen trusts.",
         ["traditional", "dividends"],
         ["Reserve the corner banquette", "Confirm dietary preferences with Lisa",
          "Bring the dividend statement he likes to review"]),
        ("beyer", "culture", "⚙️", "Private tour · Beyer Watch & Clock Museum",
         "Beyer Chronometrie", "Zürich", "Mid-morning, by appointment",
         "Eugen respects firms that 'build real, physical machinery and components' — Beyer's "
         "engineering pieces speak his language.",
         ["hardware"],
         ["Book the curator-led slot", "Line up the Siemens / ASML talking point",
          "Keep it under an hour — he values brevity"],
         "siemens", "asml"),
        ("tonhalle", "culture", "🎻", "Evening at the Tonhalle",
         "Tonhalle Zürich", "Zürich", "Friday, 19:30",
         "A measured, classical evening matches his 'quiet, predictable' temperament far better "
         "than anything flashy.",
         ["classical"],
         ["Reserve a quiet box, not the stalls", "Check the programme avoids late finishes",
          "Offer a car home afterwards"],
         "quiet", "predictable"),
        ("flims", "outdoor", "🥾", "Autumn walk above Flims",
         "Caumasee & the Rhine Gorge", "Flims", "Saturday morning",
         "The Räbers renovated their Flims holiday home — a gentle mountain walk on home ground "
         "is comfortable and personal.",
         ["mountains"],
         ["Pick an easy, well-graded trail", "Arrange a relaxed lakeside lunch after",
          "Loop in Lisa — she enjoys the mountains too"],
         "flims"),
    ])
    talking_points = _talking_points(world, cid, [
        ("Ask after the Flims holiday home and how the renovation has settled in.",
         "flims"),
        ("Pick up his Siemens / ASML point — he likes firms that build real, physical machinery.",
         "siemens", "asml"),
        ("Note how the foundation's dividend stream is holding up — he funds it from core payouts.",
         "dividend", "nestlé"),
        ("Touch on the grandchildren's savings and long-term succession; he is a steward, not a trader.",
         "grandchildren"),
    ])
    avoid = [
        "Pitching US mega-cap tech or AI names — he calls them 'pure hype'.",
        "Anything framed as speculative, high-beta or a 'strategy shift'.",
        "Trendy or loud venues; keep it quiet, classical and understated.",
    ]
    return _assemble(world, cid, interests, suggestions, talking_points, avoid)


def _build_schneider(world: World, p: Optional[Profile]) -> Rendezvous:
    cid = "schneider"
    interests = _interests(world, cid, p, [
        ("research", "Neuro research philanthropy", "philanthropy", "🔬",
         "interests", "foundation", "neurodegenerative"),
        ("gala", "Charity benefits & galas", "philanthropy", "🎗️",
         None, "charity gala"),
        ("art", "Art sponsorship", "culture", "🖼️",
         None, "art sponsorship"),
        ("family", "Family & grandchildren", "family", "👪",
         None, "wealth transmission"),
        ("engineering", "Automotive engineering", "other", "🏭",
         "professional", "automotive"),
    ])
    suggestions = _suggestions(world, cid, [
        ("benefit", "philanthropy", "🎗️", "Research-charity benefit evening",
         "University Hospital Foundation benefit", "Zürich", "Thursday, 18:30",
         "Hubertus has turned the family's wealth into 'a weapon to save Chloe' — a "
         "neuro-research benefit puts his capital and his cause in the same room.",
         ["research", "gala"],
         ["Confirm the evening's beneficiary is neurodegenerative research",
          "Brief him on the bank's matched-giving option",
          "Keep the table small and discreet — this is personal"],
         "foundation", "neurodegenerative"),
        ("kunsthaus", "culture", "🖼️", "Private viewing · Kunsthaus Zürich",
         "Kunsthaus Zürich", "Zürich", "Late afternoon, by appointment",
         "Carmen channels family funds into art sponsorship — a quiet Kunsthaus viewing is a "
         "gracious, understated gesture toward both of them.",
         ["art", "family"],
         ["Invite Carmen explicitly", "Arrange a curator for the current exhibition",
          "Avoid any hard portfolio talk on the night"],
         "art sponsorship"),
        ("dinner", "dining", "🍷", "Understated dinner at Kronenhalle",
         "Kronenhalle", "Zürich", "Evening, after the review",
         "Discreet, classic and family-appropriate — room to talk grandchildren and the "
         "foundation away from a boardroom.",
         ["family", "research"],
         ["Book a private corner", "Steer toward the foundation and the children, not returns",
          "Have the foundation's clinical-audit summary to hand if he asks"],
         "wealth transmission"),
    ])
    talking_points = _talking_points(world, cid, [
        ("Lead with the foundation and Chloe — his capital is 'fighting on the frontlines' for a cure.",
         "foundation", "neurodegenerative"),
        ("Confirm the core pharma anchor is genuinely funding Parkinson's research — he asked for an audit.",
         "parkinson's research"),
        ("Ask after Carmen and the family gathering; acknowledge how hard the month has been.",
         "carmen"),
        ("Reassure on institutional stability — he expects the bank to protect the family wealth seamlessly.",
         "institutional stability"),
    ])
    avoid = [
        "Any holding that defunds Parkinson's research — he calls that 'a personal betrayal'.",
        "Treating it as a routine portfolio review; the family's priorities have completely changed.",
        "Loud, celebratory venues — keep the tone warm, serious and private.",
    ]
    return _assemble(world, cid, interests, suggestions, talking_points, avoid)


def _build_huber(world: World, p: Optional[Profile]) -> Rendezvous:
    cid = "huber"
    interests = _interests(world, cid, p, [
        ("reforestation", "Reforestation & biodiversity", "outdoor", "🌳",
         "interests", "reforestation"),
        ("nature", "Protecting natural ecosystems", "outdoor", "🌱",
         None, "penalize companies that treat nature"),
        ("organic", "Organic, sustainable living", "dining", "🥗",
         None, "sustainable agriculture"),
        ("conservation", "Conservation field work", "travel", "🌎",
         None, "rainforest restoration"),
        ("education", "Environmental education", "philanthropy", "📚",
         None, "youth educational program"),
    ])
    suggestions = _suggestions(world, cid, [
        ("uetliberg", "outdoor", "🥾", "Morning walk up the Uetliberg",
         "Uetliberg summit trail", "Zürich", "Saturday, early",
         "Marius and Elena are hands-on conservationists — a walk in the open air suits them far "
         "better than a boardroom.",
         ["reforestation", "nature"],
         ["Pick the forested ascent, not the funicular",
          "Have the portfolio's verified-supply-chain names ready to discuss",
          "Mention the Atlantic Forest project to open the conversation"],
         "reforestation"),
        ("botanical", "outdoor", "🌿", "Tour of the Botanical Garden",
         "Botanischer Garten der Universität Zürich", "Zürich", "Weekday afternoon",
         "Elena 'invests in physical, measurable rainforest restoration' — a living collection of "
         "biodiversity is exactly her register.",
         ["reforestation", "education"],
         ["Arrange a guide for the tropical glasshouses",
          "Connect it to their Peru / Brazil field projects",
          "Bring the latest ESG impact report"],
         "rainforest restoration"),
        ("hiltl", "dining", "🥗", "Lunch at Hiltl",
         "Haus Hiltl", "Zürich", "Weekday, 12:30",
         "The world's oldest vegetarian restaurant — organic and values-aligned, a natural fit for "
         "wealth built on a sustainable-agriculture exit.",
         ["organic"],
         ["Confirm the table — it gets busy",
          "Frame the catch-up around 'magnificent' corporate moves, as Elena asked",
          "Avoid any greenwashed names in the conversation"],
         "sustainable agriculture"),
        ("exhibit", "culture", "🌍", "Sustainability exhibit at FocusTerra",
         "focusTerra, ETH Zürich", "Zürich", "Afternoon",
         "An earth-science exhibition on ecosystems and climate speaks to the Hubers' lifelong "
         "environmental mission.",
         ["nature", "conservation"],
         ["Check the current exhibition theme",
          "Tie it to the foundation's reforestation milestones",
          "Keep it light and unhurried"]),
    ])
    talking_points = _talking_points(world, cid, [
        ("Open with what a company they own did *well* for the planet — Elena asked to be called for the good news.",
         "magnificent"),
        ("Ask after the Atlantic Forest acquisition and the Peru reforestation phase.",
         "reforestation"),
        ("Acknowledge their frustration with palm-oil supply-chain loopholes and shell-company sourcing.",
         "palm oil"),
        ("Highlight verified-supply-chain holdings over anything that looks greenwashed.",
         "greenwashed"),
    ])
    avoid = [
        "Names tied to palm-oil deforestation or 'companies that treat nature as a free resource'.",
        "Backward-looking ESG scores presented as proof — they want measurable, physical impact.",
        "Generic, off-the-shelf products; they expect a values-aligned, bespoke approach.",
    ]
    return _assemble(world, cid, interests, suggestions, talking_points, avoid)


def _build_ammann(world: World, p: Optional[Profile]) -> Rendezvous:
    cid = "ammann"
    interests = _interests(world, cid, p, [
        ("football", "Football & live sport", "sport", "⚽",
         None),
        ("fine_dining", "Fine dining", "dining", "🍽️",
         None, "baur au lac"),
        ("governance", "Ethical corporate leadership", "culture", "🎤",
         "personality", "keynote speaker"),
        ("retail", "Swiss retail & branding", "other", "🛍️",
         "professional", "retail brand"),
        ("discretion", "Privacy & discretion", "other", "🤫",
         None, "private art"),
    ])
    suggestions = _suggestions(world, cid, [
        ("football", "sport", "⚽", "FC Zürich vs FC Basel — premium hospitality",
         "Stadion Letzigrund", "Zürich", "Matchday, kick-off 16:00",
         "A marquee Swiss derby in a private hospitality box: high-energy, local and a natural "
         "stage for the public face of a national brand.",
         ["football", "retail"],
         ["Book the premium business-seat box",
          "Confirm guest list stays tight and discreet",
          "Keep portfolio talk out of the box — purely relationship"]),
        ("dolder", "dining", "🍽️", "Michelin dinner at The Restaurant",
         "The Restaurant · Dolder Grand", "Zürich", "Evening, 19:30",
         "Julian dines at the city's best tables (Baur au Lac) — a two-star dinner matches his "
         "standards and gives space for a sharp, strategic conversation.",
         ["fine_dining"],
         ["Reserve well ahead — limited covers",
          "Brief him beforehand: live operational risk, not glossy ESG scores",
          "Have the governance-screening summary ready if he probes"],
         "baur au lac"),
        ("club", "culture", "🥂", "Discreet members'-club evening",
         "Zunfthaus zur Waag · private room", "Zürich", "Evening, by invitation",
         "As a keynote speaker on ethical corporate leadership, Julian values a private, "
         "reputation-safe setting where his name is never on a list.",
         ["governance", "discretion"],
         ["Use a private room, no public booking",
          "Frame around clean governance and reputational safeguards",
          "Confirm no press or open guest list"],
         "keynote speaker"),
    ])
    talking_points = _talking_points(world, cid, [
        ("Frame everything as live operational and reputational risk — backward-looking ESG scores are 'useless' to him.",
         "backward-looking"),
        ("Confirm zero labour / governance 'smoke' around any holding before the Swiss press could link his name.",
         "dump the entire position"),
        ("Ask about the western-Switzerland expansion and the media / labour-union scrutiny he's under.",
         "western switzerland"),
        ("Acknowledge his keynote on ethical corporate leadership — his portfolio 'can never hold a company with dirty hands'.",
         "keynote speaker"),
    ])
    avoid = [
        "Any name with live labour-exploitation or governance allegations — 'dump it before the press links my name'.",
        "Leaning on glossy ESG ratings as reassurance; he wants live operational signals.",
        "Public, on-the-record settings; protect his reputation and privacy at all times.",
    ]
    return _assemble(world, cid, interests, suggestions, talking_points, avoid)


# --- assembly + public entry point ------------------------------------------

def _assemble(
    world: World,
    client_id: str,
    interests: list[RendezvousInterest],
    suggestions: list[RendezvousSuggestion],
    talking_points: list[RendezvousTalkingPoint],
    avoid: list[str],
) -> Rendezvous:
    meta = world.clients.get(client_id, {})
    name = meta.get("name") or (
        world.profiles[client_id].name if client_id in world.profiles else client_id
    )
    return Rendezvous(
        client_id=client_id,
        client_name=name,
        interests=interests,
        suggestions=suggestions,
        talking_points=talking_points,
        avoid=avoid,
    )


_BUILDERS = {
    "raeber": _build_raeber,
    "schneider": _build_schneider,
    "huber": _build_huber,
    "ammann": _build_ammann,
}


def _build_generic(world: World, client_id: str, p: Optional[Profile]) -> Rendezvous:
    """Fallback for any client without a hand-curated persona: ground a couple of generic,
    citeable suggestions off whatever interests facet we have."""
    interests = _interests(world, client_id, p, [
        ("interests", "Personal interests", "other", "✨", "interests"),
    ])
    suggestions = _suggestions(world, client_id, [
        ("dinner", "dining", "🍽️", "Relationship dinner",
         "Kronenhalle", "Zürich", "Evening",
         "A discreet Zürich dinner to deepen the relationship.",
         ["interests"], ["Reserve a quiet table", "Keep it relationship-first"]),
    ])
    talking_points = _talking_points(world, client_id, [
        ("Catch up on recent personal news before any portfolio talk.",),
    ])
    return _assemble(world, client_id, interests, suggestions, talking_points,
                     ["Avoid leading with returns; build rapport first."])


def build_rendezvous(world: World, client_id: str) -> dict:
    """Build the next-meeting plan for a client, grounded in their CRM history.

    Returns the Rendezvous shape (§1) as a plain dict (snake_case), ready for the API."""
    profile = world.profiles.get(client_id)
    builder = _BUILDERS.get(client_id)
    rdv = builder(world, profile) if builder else _build_generic(world, client_id, profile)
    return rdv.model_dump()

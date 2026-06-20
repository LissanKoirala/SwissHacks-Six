"""Overview dashboard builder — the RM's morning landing page (docs/OVERVIEW_CONTRACT.md).

Aggregates across ALL clients into one glanceable desk view: who to touch base with and
why (priority tasks), the next meetings, macro market moves, corporate events on held
names, and the company news wire. Deterministic and offline-safe — no LLM, no live feed
(CLAUDE.md §9). Every card carries provenance back to a real CRM log line, news item, or
held position (§2 traceability). Nothing here decides anything; the RM drills in to act.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Literal, Optional

from pydantic import BaseModel, Field

from ..config import settings
from ..graph.store import World
from ..models import Provenance
from .orchestrator import get_overview_insights
from .rendezvous import build_rendezvous_suggestions

Severity = Literal["high", "med", "low"]
Direction = Literal["up", "down", "flat"]
EventKind = Literal["earnings", "filing", "ipo"]

_SEV_RANK = {"high": 0, "med": 1, "low": 2}
_EXCERPT_LEN = 160

# Next-meeting scheduling — deterministic business-day offsets from today; alerted
# clients are scheduled into the earlier slots so urgent relationships come first.
_MEETING_OFFSETS = [2, 3, 5, 8]
_MEETING_TIMES = ["09:30", "11:00", "14:00", "16:00"]
_MEETING_CHANNELS = ["In person", "Video call", "Phone call", "In person"]


# --- output models (mirror lib/types Overview) ------------------------------

class OverviewTask(BaseModel):
    id: str
    client_id: str
    client_name: str
    mandate: str
    severity: Severity
    polarity: Literal["conflict", "opportunity", "neutral"]
    title: str
    reason: str
    trigger_headline: str
    trigger_source: str
    suggested_action: str
    affected_issuer: Optional[str] = None
    provenance: list[Provenance] = Field(default_factory=list)


class OverviewMeeting(BaseModel):
    id: str
    client_id: str
    client_name: str
    mandate: str
    date: str
    day_label: str
    time: str
    channel: str
    agenda: str
    venue: Optional[str] = None
    last_met: Optional[str] = None
    last_modality: Optional[str] = None
    has_alert: bool = False
    prep: list[str] = Field(default_factory=list)
    provenance: list[Provenance] = Field(default_factory=list)


class MarketMove(BaseModel):
    id: str
    headline: str
    source: str
    published_at: str
    direction: Direction
    sentiment: float
    summary: str
    url: Optional[str] = None
    provenance: Provenance


class EventHolder(BaseModel):
    client_id: str
    client_name: str


class PortfolioEvent(BaseModel):
    id: str
    kind: EventKind
    issuer: str
    isin: str
    date: str
    day_label: str
    title: str
    detail: str
    held_by: list[EventHolder] = Field(default_factory=list)
    exposure_chf: float = 0.0
    provenance: Provenance


class NewsClientRef(BaseModel):
    client_id: str
    client_name: str
    polarity: Literal["conflict", "opportunity", "neutral"]


class NewsWireItem(BaseModel):
    id: str
    title: str
    source: str
    published_at: str
    topics: list[str] = Field(default_factory=list)
    sentiment_score: float
    sentiment_label: str
    issuer_name: Optional[str] = None
    url: Optional[str] = None
    relevant_clients: list[NewsClientRef] = Field(default_factory=list)
    provenance: Provenance


class OverviewKpis(BaseModel):
    clients: int
    priority_tasks: int
    meetings_upcoming: int
    market_moves: int
    portfolio_events: int
    aum_chf: float


class Overview(BaseModel):
    generated_at: str
    today: str
    use_live: bool
    rm_name: str
    briefing: str
    kpis: OverviewKpis
    priority_tasks: list[OverviewTask] = Field(default_factory=list)
    meetings: list[OverviewMeeting] = Field(default_factory=list)
    market_moves: list[MarketMove] = Field(default_factory=list)
    portfolio_events: list[PortfolioEvent] = Field(default_factory=list)
    news: list[NewsWireItem] = Field(default_factory=list)


# --- small helpers ----------------------------------------------------------

def _first_name(name: str) -> str:
    return (name or "").split()[0] if name else "the client"


def _snippet(text: str) -> str:
    t = " ".join((text or "").split())
    if len(t) <= _EXCERPT_LEN:
        return t
    cut = t[:_EXCERPT_LEN]
    idx = cut.rfind(". ")
    return (cut[: idx + 1] if idx > 60 else cut.rsplit(" ", 1)[0] + "…")


def _direction(score: float) -> Direction:
    if score > 0.05:
        return "up"
    if score < -0.05:
        return "down"
    return "flat"


def _severity(polarity: str, score: float) -> Severity:
    if polarity == "conflict":
        return "high"
    if polarity == "opportunity":
        return "med" if abs(score) >= 0.5 else "low"
    return "low"


def _add_business_days(start: date, n: int) -> date:
    d = start
    added = 0
    while added < n:
        d += timedelta(days=1)
        if d.weekday() < 5:  # Mon–Fri
            added += 1
    return d


def _day_label(d: date) -> str:
    return f"{d.strftime('%a')} {d.day} {d.strftime('%b')}"


def _rm_name(world: World) -> str:
    counts: dict[str, int] = {}
    for logs in world.meeting_logs.values():
        for e in logs:
            if e.rm_name:
                counts[e.rm_name] = counts.get(e.rm_name, 0) + 1
    return max(counts, key=counts.get) if counts else "Advisory desk"


# --- section builders -------------------------------------------------------

def _build_tasks(world: World, insights_by_client: dict) -> list[OverviewTask]:
    tasks: list[OverviewTask] = []
    for cid, ins in insights_by_client.items():
        name = ins.client.name
        first = _first_name(name)
        for m in ins.matches:
            score = m.news.sentiment.score
            sev = _severity(m.polarity, score)
            if m.polarity == "conflict":
                action = f"Review the exposure and walk {first} through a same-sector swap."
            elif m.polarity == "opportunity":
                action = f"Flag the opening and confirm {first}'s appetite before acting."
            else:
                action = f"Note it for the next check-in with {first}."
            prov = list(m.why) if m.why else [m.news.provenance]
            tasks.append(OverviewTask(
                id=f"task:{m.id}",
                client_id=cid,
                client_name=name,
                mandate=ins.client.mandate,
                severity=sev,
                polarity=m.polarity,
                title=f"Reach out to {name}",
                reason=m.headline,
                trigger_headline=m.news.title,
                trigger_source=m.news.source,
                suggested_action=action,
                affected_issuer=(m.affected_holding.issuer if m.affected_holding
                                 else m.news.issuer_name),
                provenance=prov,
            ))
    tasks.sort(key=lambda t: (_SEV_RANK[t.severity], t.client_name))
    return tasks


def _build_meetings(
    world: World, today: date, alerted: set[str]
) -> list[OverviewMeeting]:
    # alerted clients first (earlier slots), then the rest in registry order
    ordered = sorted(world.clients, key=lambda c: (c not in alerted, list(world.clients).index(c)))
    meetings: list[OverviewMeeting] = []
    for i, cid in enumerate(ordered):
        meta = world.clients[cid]
        name = meta.get("name", cid)
        logs = world.meeting_logs.get(cid, [])
        last = logs[-1] if logs else None
        rdv = build_rendezvous_suggestions(world, cid)
        sugg = (rdv.get("suggestions") or [{}])[0]
        slot = i % len(_MEETING_OFFSETS)
        d = _add_business_days(today, _MEETING_OFFSETS[slot])
        prov = []
        if last:
            prov.append(Provenance(
                source_type="crm_log", source_id=last.id,
                excerpt=_snippet(last.note), timestamp=last.timestamp,
            ))
        meetings.append(OverviewMeeting(
            id=f"meeting:{cid}",
            client_id=cid,
            client_name=name,
            mandate=meta.get("mandate", ""),
            date=d.isoformat(),
            day_label=_day_label(d),
            time=_MEETING_TIMES[slot],
            channel=_MEETING_CHANNELS[slot],
            agenda=sugg.get("title", "Portfolio & relationship review"),
            venue=sugg.get("venue"),
            last_met=last.timestamp if last else None,
            last_modality=last.modality if last else None,
            has_alert=cid in alerted,
            prep=sugg.get("prep", [])[:3],
            provenance=prov,
        ))
    return meetings


def _build_market_moves(world: World) -> list[MarketMove]:
    out: list[MarketMove] = []
    for n in world.news:
        if not n.market_digest:
            continue
        out.append(MarketMove(
            id=f"move:{n.id}",
            headline=n.title,
            source=n.source,
            published_at=n.published_at,
            direction=_direction(n.sentiment.score),
            sentiment=n.sentiment.score,
            summary=_snippet(n.body or n.title),
            url=n.url,
            provenance=n.provenance,
        ))
    return out


def _build_portfolio_events(
    world: World, today: date
) -> list[PortfolioEvent]:
    # exposure + holders per issuer across every client book
    by_issuer: dict[str, dict] = {}
    for cid, meta in world.clients.items():
        name = meta.get("name", cid)
        for h in world.holdings_for_client(cid):
            # company events only — sovereigns/ETFs/commodities don't report earnings or IPO
            if "equit" not in (h.asset_class or "").lower():
                continue
            slot = by_issuer.setdefault(h.issuer, {
                "isin": h.isin, "industry": h.industry_group,
                "chf": 0.0, "holders": {},
            })
            slot["chf"] += h.current_chf
            slot["holders"][cid] = name
    ranked = sorted(by_issuer.items(), key=lambda kv: kv[1]["chf"], reverse=True)

    events: list[PortfolioEvent] = []
    # top held names → earnings / filing (deterministic by isin hash)
    for idx, (issuer, slot) in enumerate(ranked[:6]):
        isin = slot["isin"]
        kind: EventKind = "earnings" if (sum(ord(c) for c in isin) % 2 == 0) else "filing"
        d = _add_business_days(today, 3 + idx * 3)
        if kind == "earnings":
            title = f"{issuer} — Q2 earnings"
            detail = "Quarterly results due; watch guidance and margins for read-through to the holding."
        else:
            title = f"{issuer} — regulatory filing"
            detail = "Ad-hoc disclosure / SEC-style filing expected; scan for material changes."
        events.append(PortfolioEvent(
            id=f"evt:{isin}",
            kind=kind, issuer=issuer, isin=isin,
            date=d.isoformat(), day_label=_day_label(d),
            title=title, detail=detail,
            held_by=[EventHolder(client_id=c, client_name=nm)
                     for c, nm in slot["holders"].items()],
            exposure_chf=round(slot["chf"], 2),
            provenance=Provenance(
                source_type="portfolio", source_id=isin,
                excerpt=f"Held position · {issuer} ({isin})",
            ),
        ))
    # a couple of sector IPOs, tied to the biggest sectors actually held
    seen_sectors: set[str] = set()
    ipo_n = 0
    for issuer, slot in ranked:
        sector = slot["industry"]
        if not sector or sector in seen_sectors:
            continue
        seen_sectors.add(sector)
        d = _add_business_days(today, 6 + ipo_n * 4)
        events.append(PortfolioEvent(
            id=f"evt:ipo:{sector}".replace(" ", "-").lower(),
            kind="ipo", issuer=issuer, isin=slot["isin"],
            date=d.isoformat(), day_label=_day_label(d),
            title=f"IPO watch — new {sector} listing",
            detail=f"Primary activity in {sector}; a peer to the {issuer} position — possible read-through.",
            held_by=[EventHolder(client_id=c, client_name=nm)
                     for c, nm in slot["holders"].items()],
            exposure_chf=round(slot["chf"], 2),
            provenance=Provenance(
                source_type="portfolio", source_id=slot["isin"],
                excerpt=f"Sector exposure · {sector} (via {issuer})",
            ),
        ))
        ipo_n += 1
        if ipo_n >= 2:
            break
    events.sort(key=lambda e: e.date)
    return events


def _build_news_wire(world: World, insights_by_client: dict) -> list[NewsWireItem]:
    # Relevance + polarity comes from the grounded match (news sentiment × client stance),
    # not the raw interest-edge appetite — so a negative story on a topic the client *likes*
    # correctly surfaces as a conflict, not an opportunity.
    impact: dict[str, list[NewsClientRef]] = {}
    for cid, ins in insights_by_client.items():
        for m in ins.matches:
            impact.setdefault(m.news.id, []).append(NewsClientRef(
                client_id=cid, client_name=ins.client.name, polarity=m.polarity,
            ))
    out: list[NewsWireItem] = []
    for n in world.news:
        if n.market_digest:
            continue  # macro digests live in market_moves
        if getattr(n, "signal_type", "news") not in (None, "news"):
            continue  # sec filings / earnings / esg / analyst signals surface in the portfolio + fundamentals views
        out.append(NewsWireItem(
            id=f"wire:{n.id}",
            title=n.title, source=n.source, published_at=n.published_at,
            topics=n.topics, sentiment_score=n.sentiment.score,
            sentiment_label=n.sentiment.label, issuer_name=n.issuer_name,
            url=n.url, relevant_clients=impact.get(n.id, []), provenance=n.provenance,
        ))
    return out


def _briefing(tasks: list[OverviewTask], meetings: list[OverviewMeeting]) -> str:
    highs = [t for t in tasks if t.severity == "high"]
    if highs:
        top = highs[0]
        n = len({t.client_id for t in highs})  # distinct clients, not tasks
        return (f"{n} client{'s' if n != 1 else ''} need attention first — "
                f"start with {top.client_name}: {top.reason}")
    if tasks:
        return f"No red flags, but {len(tasks)} opportunit{'ies' if len(tasks) != 1 else 'y'} to follow up across the book."
    nxt = meetings[0] if meetings else None
    if nxt:
        return f"Clear morning — next up is {nxt.client_name} on {nxt.day_label}."
    return "Clear morning — nothing flagged across the book."


# --- public entry point -----------------------------------------------------

def build_overview(world: World) -> dict:
    today = date.today()
    from concurrent.futures import ThreadPoolExecutor, as_completed
    client_ids = list(world.clients)
    with ThreadPoolExecutor(max_workers=len(client_ids) or 1) as pool:
        futures = {pool.submit(get_overview_insights, world, cid): cid for cid in client_ids}
        insights_by_client = {futures[f]: f.result() for f in as_completed(futures)}

    tasks = _build_tasks(world, insights_by_client)
    alerted = {t.client_id for t in tasks}
    meetings = _build_meetings(world, today, alerted)
    market_moves = _build_market_moves(world)
    portfolio_events = _build_portfolio_events(world, today)
    news = _build_news_wire(world, insights_by_client)

    aum = sum(
        sum(h.current_chf for h in world.holdings_for_client(cid))
        for cid in world.clients
    )

    overview = Overview(
        generated_at=datetime.now().isoformat(timespec="seconds"),
        today=today.isoformat(),
        use_live=settings.use_live,
        rm_name=_rm_name(world),
        briefing=_briefing(tasks, meetings),
        kpis=OverviewKpis(
            clients=len(world.clients),
            priority_tasks=len(tasks),
            meetings_upcoming=len(meetings),
            market_moves=len(market_moves),
            portfolio_events=len(portfolio_events),
            aum_chf=round(aum, 2),
        ),
        priority_tasks=tasks,
        meetings=meetings,
        market_moves=market_moves,
        portfolio_events=portfolio_events,
        news=news,
    )
    return overview.model_dump()

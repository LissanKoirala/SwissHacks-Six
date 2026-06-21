"""Frozen shared contracts (CLAUDE.md §7). Every fact and suggestion carries provenance.

These pydantic models are THE seam between streams. Changing a field here is a contract
change — update CLAUDE.md and ping the channel.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

# --- vocabulary types -------------------------------------------------------

SourceType = Literal[
    "crm_log", "news", "cio_list", "portfolio", "mandate", "market_digest",
    # additional free data sources (CLAUDE.md §6) — each event signal cites its true origin
    "sec_filing", "esg", "earnings", "analyst", "macro", "fundamentals", "insider",
]
Polarity = Literal["conflict", "opportunity", "neutral"]
Rating = Literal["BUY", "HOLD", "SELL"]
SentimentLabel = Literal["BEARISH", "NEUTRAL", "BULLISH"]
FacetName = Literal["professional", "interests", "historical", "personality"]


# --- provenance (CLAUDE.md §7.5) -------------------------------------------

class Provenance(BaseModel):
    """A pointer back to the source of any fact/alert/suggestion. If you can't cite it,
    don't surface it."""
    source_type: SourceType
    source_id: str
    excerpt: str
    url: Optional[str] = None
    timestamp: Optional[str] = None


# --- CRM graph --------------------------------------------------------------

class RiskSignal(BaseModel):
    """A risk-appetite cue lifted from a note: a short phrase and its direction.
    `direction` is "up" (risk-on) or "down" (de-risk). Stored on the log entry so the
    risk timeline can reuse the analysis instead of re-scoring (CLAUDE.md §9)."""
    term: str
    direction: str  # "up" | "down"


class MeetingLogEntry(BaseModel):
    """Immutable, append-only raw entry (CLAUDE.md §3)."""
    id: str
    client_id: str
    timestamp: str
    modality: str  # Physical Meeting / Phone Call / Email / ...
    contact: str
    rm_name: Optional[str] = None
    note: str
    source: Provenance
    # Risk cues captured by the analysis at confirm time. Empty → the timeline falls
    # back to its keyword lexicon for this entry.
    risk_signals: list[RiskSignal] = Field(default_factory=list)


class Statement(BaseModel):
    """One distilled profile point, with a pointer back to the log line that justifies it.
    `weight` is the RM-set importance (1.0 = normal) so the desk can rank what matters."""
    text: str
    provenance: Provenance
    weight: float = 1.0
    # How this fact entered the profile: "seed" (curated ground truth), "log" (auto-derived from
    # the meeting log by the CRM agent), or "capture" (materialised from an RM note). Lets the UI
    # show that the DNA is genuinely read from the logs, not hand-entered (CLAUDE.md §8.B).
    origin: Literal["seed", "log", "capture"] = "seed"


class InterestEdge(BaseModel):
    """A client's subscription to a topic (CLAUDE.md §3 meta graph).
    polarity 'opportunity' = the client wants more of this; 'conflict' = the client wants to
    avoid/penalise it."""
    client_id: str
    topic: str
    facet: FacetName
    polarity: Polarity
    weight: float = 1.0
    provenance: Provenance
    origin: Literal["seed", "log", "capture"] = "seed"
    # How many meeting-log entries independently corroborate this edge — evidence that the DNA
    # is grounded in the conversation history (shown as "n entries" in the UI).
    log_support: int = 1


class Profile(BaseModel):
    """Materialised view rebuilt from the meeting_log."""
    client_id: str
    name: str
    mandate: str  # Defensive / Balanced / Growth
    headline: str
    facets: dict[str, list[Statement]] = Field(default_factory=dict)
    interest_edges: list[InterestEdge] = Field(default_factory=list)
    # How many meeting-log entries the CRM agent read to build this DNA — surfaced as
    # "auto-built from N CRM entries" so the read-the-logs claim is visible (CLAUDE.md §8.B).
    log_entries_scanned: int = 0


# --- RM Capture (multimodal note → stage → confirm) -------------------------

class CaptureExtractRequest(BaseModel):
    """Raw note (typed, dictated, or OCR'd) → read-only staged draft. No mutation."""
    note: str                       # raw text (typed, dictated, or OCR'd)
    modality: str = "File Note"     # Physical Meeting / Phone Call / Video Call / Email / Lunch / File Note / Physical Event
    contact: str = ""               # who the RM spoke with
    rm_name: str = ""
    date: str = ""                  # ISO yyyy-mm-dd; default = server today if empty


class CaptureFollowupRequest(BaseModel):
    """Conversational capture turn: the note gathered so far + the ids of questions
    already asked → the single best next spoken follow-up (read-only)."""
    note: str = ""                  # transcript accumulated so far
    asked: list[str] = []           # question ids already asked this session


class TTSRequest(BaseModel):
    """Text to speak aloud for the conversational capture voice."""
    text: str


class ProposedEdge(BaseModel):
    """A candidate interest edge the RM can deselect/edit before confirm."""
    topic: str                      # MUST be a TOPIC_VOCAB key
    topic_label: str
    facet: str                      # professional / interests / historical / personality
    polarity: str                   # opportunity / conflict / neutral
    rationale: str                  # short why, quotes the cue
    selected: bool = True           # default-on; RM can deselect/edit
    weight: float = 1.0             # RM-set importance (1.0 = normal)


class ProposedFacet(BaseModel):
    """A candidate facet statement the RM can deselect/edit before confirm."""
    facet: str
    text: str
    selected: bool = True
    weight: float = 1.0             # RM-set importance (1.0 = normal)


class CaptureConfirmRequest(BaseModel):
    """The RM gate — only the kept (selected) edges/facets are materialised."""
    note: str                       # final (RM-edited) note text
    modality: str
    contact: str = ""
    rm_name: str = ""
    date: str = ""
    edges: list[ProposedEdge] = []  # only the RM-kept ones (selected) are applied
    facets: list[ProposedFacet] = []
    # Risk cues the analysis surfaced for this note (from the staged draft). Carried
    # through so the timeline reflects the new entry without a second model call.
    risk_signals: list[RiskSignal] = []


# --- News graph -------------------------------------------------------------

class Sentiment(BaseModel):
    score: float  # [-1, 1]
    label: SentimentLabel
    # Where the score/label came from and how it was thresholded — so an RM can audit *why* an
    # item reads BULLISH/BEARISH, not just that it does (Trust & Explainability, CLAUDE.md §2).
    source: Optional[str] = None  # e.g. "Event Registry · |score|>0.2" / "stock-labels · |score|>0.2"


class NewsItem(BaseModel):
    id: str
    title: str
    body: str
    source: str
    url: Optional[str] = None
    published_at: str
    topics: list[str] = Field(default_factory=list)  # classified once, shared (CLAUDE.md §9)
    sentiment: Sentiment
    issuer_name: Optional[str] = None
    issuer_isin: Optional[str] = None
    market_digest: bool = False  # general market info -> DIALOGUE only, never strategy (§2)
    # Which feed this signal came from: "news" | "sec_filing" | "esg" | "earnings" | "analyst" |
    # "macro". Lets the dashboard badge the origin; matching/advisory treat them all as news.
    signal_type: str = "news"
    provenance: Provenance


# --- Portfolio / market graph ----------------------------------------------

class Holding(BaseModel):
    portfolio: str  # Defensive / Balanced / Growth
    asset_class: str
    sub_asset_class: str
    region: Optional[str] = None
    industry_group: Optional[str] = None
    issuer: str
    security: Optional[str] = None
    isin: str
    target_chf: float = 0.0
    current_chf: float = 0.0
    valor: Optional[str] = None
    mic: Optional[str] = None
    yahoo: Optional[str] = None
    # --- Live SIX enrichment (only when USE_LIVE=1 and the listing has data; additive,
    # never feeds the deterministic valuation/drift math which stays on current_chf). ---
    live_price: Optional[float] = None       # latest SIX EOD close, price per share
    live_ccy: Optional[str] = None
    live_ts: Optional[str] = None            # ISO timestamp of that close
    live_change_pct: Optional[float] = None  # close vs open, same session
    price_source: Optional[str] = None       # e.g. "SIX EOD"
    six_ticker: Optional[str] = None         # SIX-resolved exchange ticker (listing_base)
    # --- CIO deviation status (Portfolio Agent: "flag assets no longer on the CIO list") ---
    cio_rating: Optional[str] = None         # BUY / HOLD / SELL from the CIO list, or None if off-list
    cio_status: Optional[str] = None         # "BUY" | "HOLD" | "SELL" | "OFF_LIST" | "CASH"
    provenance: Optional["Provenance"] = None  # pointer to the Sample Portfolio workbook row
    # --- Risk metrics (HI1): live SIX histVol30d when available, else the sector model ---
    hist_vol_30d: Optional[float] = None     # annualised 30-day historical volatility (decimal)
    beta: Optional[float] = None             # market beta
    pe_ratio: Optional[float] = None
    dividend_yield: Optional[float] = None
    market_cap: Optional[float] = None
    risk_source: Optional[str] = None        # "SIX EOD" | "sector model"


class MandateTarget(BaseModel):
    asset_class: str
    sub_asset_class: str
    benchmark: Optional[str] = None
    target_pct: float
    target_chf: float
    current_chf: float = 0.0
    current_pct: float = 0.0
    drift_pp: float = 0.0          # current_pct - target_pct
    breach: bool = False           # |drift| > 2.0pp
    provenance: Optional["Provenance"] = None  # pointer to the Portfolio Strategies workbook row


class Mandate(BaseModel):
    name: str  # Defensive / Balanced / Growth
    total_chf: float
    targets: list[MandateTarget] = Field(default_factory=list)


class CIOStock(BaseModel):
    """An approved-universe name, labelled with sentiment + ethics tags (CLAUDE.md §6/§8)."""
    rating: Rating
    asset_class: Optional[str] = None
    sub_asset_class: Optional[str] = None
    region: Optional[str] = None
    industry_group: Optional[str] = None
    issuer: str
    security: Optional[str] = None
    isin: str
    cio_view: Optional[str] = None
    valor: Optional[str] = None
    mic: Optional[str] = None
    yahoo: Optional[str] = None
    sentiment: Optional[Sentiment] = None
    value_tags: list[str] = Field(default_factory=list)  # ethics/value labels, e.g. "clean-governance"
    # --- Risk metrics (HI1): for risk-matched substitution (live SIX else the sector model) ---
    hist_vol_30d: Optional[float] = None     # annualised 30-day historical volatility (decimal)
    beta: Optional[float] = None             # market beta
    pe_ratio: Optional[float] = None
    dividend_yield: Optional[float] = None
    market_cap: Optional[float] = None
    risk_source: Optional[str] = None        # "SIX EOD" | "sector model"
    provenance: Provenance


# --- Transaction ledger + cash flows (HI4: history, cost basis, income) --------------------

class PortfolioTransaction(BaseModel):
    """One historical trade from the workbook Transactions tabs. Immutable history; never matched."""
    transaction_id: str
    timestamp: str                 # ISO yyyy-mm-dd
    portfolio: str
    isin: str
    issuer: str
    side: Literal["BUY", "SELL"]
    quantity: Optional[float] = None
    price_local: Optional[float] = None
    currency: Optional[str] = None
    fx_chf: Optional[float] = None
    price_chf: Optional[float] = None
    amount_chf: float = 0.0
    rationale: Optional[str] = None
    price_source: Optional[str] = None
    provenance: Provenance


class CashFlow(BaseModel):
    """One cash movement from the workbook Cash Flows tab: COUPON / DEPOSIT / WITHDRAWAL / FEE."""
    flow_id: str
    timestamp: str
    portfolio: str
    side: str
    amount_chf: float = 0.0
    rationale: Optional[str] = None
    provenance: Provenance


# --- Issuer reference data (context for dialogue + portfolio view, NOT matched) -------------

class InsiderTrade(BaseModel):
    """One Form 4 insider transaction (SEC). Context only — never drives a strategy match."""
    insider: str
    role: Optional[str] = None
    transaction: Literal["BUY", "SELL"]
    shares: Optional[float] = None
    value_usd: Optional[float] = None
    date: str
    provenance: Provenance


class Fundamentals(BaseModel):
    """Per-issuer fundamentals + dividend schedule + insider summary, keyed by ISIN.
    Enriches the portfolio view and seeds dialogue; it is reference data, not an event signal,
    so it never enters the match pipeline (CLAUDE.md §2: general info feeds dialogue, not strategy)."""
    isin: str
    issuer: str
    as_of: Optional[str] = None
    currency: Optional[str] = None
    pe_ratio: Optional[float] = None
    dividend_yield: Optional[float] = None       # percent, e.g. 3.6
    next_ex_dividend: Optional[str] = None        # ISO date of the next ex-dividend
    market_cap: Optional[float] = None            # in `currency`
    week52_high: Optional[float] = None
    week52_low: Optional[float] = None
    insider_summary: Optional[str] = None         # e.g. "Net insider selling over the last 90 days"
    insider_trades: list[InsiderTrade] = Field(default_factory=list)
    provenance: Provenance


# --- Meta graph / match -----------------------------------------------------

class TopicMatch(BaseModel):
    """A shared topic node = the match (set intersection, no LLM). Carries both sides' provenance."""
    topic: str
    client_provenance: Provenance   # the interest edge / log line
    news_provenance: Provenance     # the news tag


# --- Worldview engine -------------------------------------------------------
# The differentiator (CLAUDE.md §1): we do NOT reduce the client to a topic set at the match
# boundary. Each signal is scored, reframed, and reacted-to through a living model of the client's
# worldview — their convictions (weighted, corroborated, dated edges), exposure (portfolio),
# memory (their own past words), and predicted reaction. All deterministic and fully cited, so
# personalisation survives offline and every number/sentence points back to a source (§2/§9).

class ScoreComponent(BaseModel):
    """One factor behind the conviction-weighted relevance score, with its contribution + a cite.
    The breakdown is the trust surface: the RM sees *why* an item out-ranked the others."""
    label: str                      # "Conviction" / "Exposure" / "Sentiment" / "Freshness" / "Signal"
    detail: str                     # human-readable basis, e.g. "personality conviction · logged 2026-03-05"
    points: float                   # points this factor added to the 0–100 score
    max_points: float               # the cap for this factor (so the bar can be drawn)
    provenance: Optional[Provenance] = None


class RelevanceScore(BaseModel):
    """A transparent 0–100 relevance for THIS (client, item) pair — every term cited (§2).
    Replaces binary match/no-match: conviction × exposure × news strength × freshness × signal."""
    score: int                      # 0–100
    components: list[ScoreComponent] = Field(default_factory=list)
    summary: str                    # one-line plain-English additive story of the score


class LensFraming(BaseModel):
    """The 'Client Lens' (#1): the same generic news rewritten through THIS client's documented
    worldview — quoting their own prior words back to them. The news adapts to the reader."""
    headline: str                   # the reframed, client-specific headline
    narrative: str                  # 1–2 sentences tying the news to their own documented stance
    client_quote: Optional[str] = None   # the exact prior quote being echoed
    quote_date: Optional[str] = None
    draft_source: Literal["llm", "template"] = "template"
    provenance: list[Provenance] = Field(default_factory=list)


class Match(BaseModel):
    id: str
    client_id: str
    polarity: Polarity              # conflict (avoid) or opportunity (reward)
    headline: str
    news: NewsItem
    shared_topics: list[TopicMatch] = Field(default_factory=list)
    affected_holding: Optional[Holding] = None  # the held name the news is about, if any
    why: list[Provenance] = Field(default_factory=list)
    # --- worldview enrichment (deterministic, free — computed at match time, §9) ---
    relevance: Optional[RelevanceScore] = None   # conviction-weighted 0–100 score + cited breakdown
    lens: Optional[LensFraming] = None           # the item reframed through this client's worldview
    celebrate: bool = False         # a genuine 'call to celebrate' good-news moment (#4), not a warning


# --- Advisory outputs (CLAUDE.md §1: two things) ----------------------------

class SubstitutionMetrics(BaseModel):
    """Side-by-side sold-vs-replacement comparison for a swap — the 'substitution metrics' the
    Ammann persona's professional briefing needs to evidence a 'similar risk' replacement."""
    sell_issuer: Optional[str] = None
    buy_issuer: Optional[str] = None
    vol_sell: Optional[float] = None        # annualised 30d historical volatility (decimal)
    vol_buy: Optional[float] = None
    vol_delta: Optional[float] = None       # vol_buy - vol_sell (≈0 ⇒ similar risk)
    beta_sell: Optional[float] = None
    beta_buy: Optional[float] = None
    pe_sell: Optional[float] = None
    pe_buy: Optional[float] = None
    sentiment_sell: Optional[float] = None
    sentiment_buy: Optional[float] = None
    sentiment_delta: Optional[float] = None
    sector_match: bool = False
    sub_asset_class_match: bool = False
    drift_pp_after: Optional[float] = None  # buy sleeve drift after the swap
    value_tags_sell: list[str] = Field(default_factory=list)
    value_tags_buy: list[str] = Field(default_factory=list)
    risk_source: Optional[str] = None       # "SIX EOD" | "sector model"
    # Pointers behind the quantitative comparison (the sold + bought CIO rows, the risk source) so
    # every metric in the side-by-side is clickable, not just asserted (Trust, §2/§7.5).
    provenance: list[Provenance] = Field(default_factory=list)


class SwapProposal(BaseModel):
    action: Literal["SWAP", "REDUCE", "INCREASE", "DIVEST", "HOLD"]
    sell_isin: Optional[str] = None
    sell_issuer: Optional[str] = None
    buy_isin: Optional[str] = None
    buy_issuer: Optional[str] = None
    industry_group: Optional[str] = None
    same_sector: bool = True
    amount_chf: float = 0.0
    rationale: str
    drift_safe: bool = True         # value-neutral swap within the same sub-asset-class
    # Live SIX price of the BUY candidate (when available) — makes the proposal concrete.
    buy_live_price: Optional[float] = None
    buy_live_ccy: Optional[str] = None
    buy_live_ts: Optional[str] = None
    substitution: Optional[SubstitutionMetrics] = None  # sold-vs-replacement metrics (HI2)
    provenance: list[Provenance] = Field(default_factory=list)


class GoodNewsBriefing(BaseModel):
    """A positive, values-aligned 'good news' framing for the RM to share (Huber persona:
    'Generate a Good News Briefing and flag the stock as a buy recommendation'). Surfaced on
    opportunity matches alongside (or instead of) a trade."""
    headline: str
    why_authentic: str            # why it genuinely matches this client's documented values
    action_summary: str           # the recommended overweight/hold, in plain words
    provenance: list[Provenance] = Field(default_factory=list)


class StrategyProposal(BaseModel):
    """Output 1: same-sector swaps within the mandate, limited to CIO-approved, sentiment-screened
    stocks. Stays inside the rails."""
    client_id: str
    headline: str
    polarity: Polarity
    swaps: list[SwapProposal] = Field(default_factory=list)
    constraints_checked: list[str] = Field(default_factory=list)
    good_news_briefing: Optional[GoodNewsBriefing] = None  # positive framing on opportunity matches
    provenance: list[Provenance] = Field(default_factory=list)


class DialogueSuggestion(BaseModel):
    """Output 2: conversation starters in the client's preferred style, mixing client-specific
    signals with light general-market context."""
    client_id: str
    style: str
    talking_points: list[Statement] = Field(default_factory=list)
    draft_message: str
    # How the draft was produced: "llm" (Phoeniqs, style-tuned) or "template" (deterministic,
    # style-aware fallback). Surfaced to the RM so the provenance of the prose itself is honest.
    draft_source: Literal["llm", "template"] = "template"
    market_context: list[Statement] = Field(default_factory=list)
    provenance: list[Provenance] = Field(default_factory=list)


# --- Client Digital Twin (pre-mortem on a proposal; advisory only) ----------

class TwinDriver(BaseModel):
    """One reason the client is likely to react the way they do, grounded in a weighted
    profile fact and citing its source. `contribution` is the signed effect on the stance
    (negative = pushes toward objection)."""
    label: str                      # human-readable driver, e.g. "Avoids US mega-cap software"
    kind: str                       # value-aligned | value-conflict | risk-reassurance | risk-mismatch | framing | life-event
    stance: str                     # supportive | opposing | neutral
    weight: float                   # the underlying fact's RM-set importance
    contribution: float             # signed effect on the aggregate stance
    detail: str                     # short, plain explanation
    provenance: Provenance


class ClientTwin(BaseModel):
    """Predicted client reaction to the current proposal, to help the RM prepare. Never
    contacts the client (CLAUDE.md §2: advisory only — the agent proposes, the RM decides)."""
    client_id: str
    client_name: str
    stance: str                     # receptive | mixed | likely_to_object
    score: float                    # aggregate stance score (signed)
    confidence: str                 # low | medium | high
    summary: str                    # one-line read (deterministic, or LLM-polished)
    anticipated_objection: Optional[str] = None  # "what the client might say" (LLM, optional)
    suggested_framing: Optional[str] = None      # how to pre-empt it (LLM, optional) → feeds dialogue
    drivers: list[TwinDriver] = Field(default_factory=list)
    llm_used: bool = False
    provenance: list[Provenance] = Field(default_factory=list)


class TwinAskRequest(BaseModel):
    """The RM asks the twin a free-form question about the client."""
    question: str


class TwinAskAnswer(BaseModel):
    """The twin's predicted answer — how the client would likely think/respond — grounded
    in the cited profile facts. Speaks to the RM about the client; never advises the client."""
    client_id: str
    question: str
    answer: str
    confidence: str                 # low | medium | high
    citations: list[Provenance] = Field(default_factory=list)
    llm_used: bool = False


class TwinFormatRequest(BaseModel):
    """Turn drafted content into a ready-to-review message for a channel. The RM reviews
    and sends — the agent never sends anything."""
    content: str
    channel: str                    # email | sms | whatsapp | talking_points | call_script
    tone: Optional[str] = None      # optional steer, e.g. "warm", "concise", "formal"


class TwinFormatResult(BaseModel):
    channel: str
    formatted: str
    llm_used: bool = False


# --- API contract (CLAUDE.md §7.4) -----------------------------------------

class RMQueryRequest(BaseModel):
    """RM conversational query about a proposal (ST1): ask for context, or request an alternative."""
    match_id: Optional[str] = None
    question: str = ""
    exclude_isin: Optional[str] = None


class MatchResolutionRequest(BaseModel):
    """On-demand resolution draft for a single match (map holding popover)."""
    match_id: str
    holding_isin: Optional[str] = None
    refresh: bool = False


class ClientSummary(BaseModel):
    client_id: str
    name: str
    mandate: str
    headline: str
    alert_count: int = 0


class ReactionPrediction(BaseModel):
    """The 'Reaction Simulator' (#3): how this client is likely to react to the proposal, predicted
    from their personality facet + their own past words — so the RM walks in prepared, not surprised.
    Advisory only and clearly labelled 'RM judgement required' (§2): it never speaks AS the client,
    it forecasts FOR the RM. Strong model lazily, deterministic fallback keeps it offline (§9)."""
    predicted_objection: str        # the pushback the RM should expect, in the client's own register
    emotional_register: str         # a short tag, e.g. "anxious · feels betrayed" / "sceptical" / "proud"
    suggested_rebuttal: str         # how the RM can meet it, grounded in what the client respects
    confidence: Literal["grounded", "inferred"] = "grounded"  # grounded = anchored to a real quote
    draft_source: Literal["llm", "template"] = "template"
    provenance: list[Provenance] = Field(default_factory=list)


class LifeEventSignal(BaseModel):
    """Life-event-aware timing (#5): a dated event/belief shift that recently reshaped the client's
    priorities. Mines the *dates* on facets/edges vs today, so the desk notices the human moment and
    asks whether the stated mandate still reflects the revealed priorities."""
    label: str                      # short banner label, e.g. "Recent diagnosis in the family"
    date: str                       # ISO date of the event
    months_ago: int
    topic: Optional[str] = None     # the value topic it shifted, if any
    facet: Optional[str] = None     # which DNA facet recorded it
    implication: str                # the desk action it implies (verify mandate, anticipate, …)
    provenance: Provenance


class ClientInsights(BaseModel):
    """GET /clients/{id}/insights"""
    client: ClientSummary
    matches: list[Match] = Field(default_factory=list)
    strategy_proposal: Optional[StrategyProposal] = None
    dialogue_suggestion: Optional[DialogueSuggestion] = None
    # Proposals for the other DISTINCT salient matches (HI5) — a client with two genuine triggers
    # (e.g. a conflict on one holding + an opportunity on another) gets a proposal for each.
    additional_proposals: list[StrategyProposal] = Field(default_factory=list)
    # --- worldview engine outputs (per opened client, lazily; §9) ---
    reaction: Optional[ReactionPrediction] = None          # digital-twin reaction to the primary match
    life_events: list[LifeEventSignal] = Field(default_factory=list)  # values-shift timing signals
    generated_at: str
    llm_used: bool = False


# --- The Front Door: email/news → kanban → agentic execution → RM sign-off -----------------
# A workbench that does the work. Two "front doors" create tasks: inbound client email and
# selectively-surfaced news/risk. The agent then ATTEMPTS each task with the client's data at
# hand and parks a draft for the RM to sign off (Golden rule §2: advisory only — the agent
# proposes, the RM approves, nothing auto-executes a trade or auto-sends a message).

# backlog  → freshly created, agent has not run yet
# started  → a COMPLEX task the agent began and left part-done for the RM to carry forward
# review   → the agent produced a complete draft; awaiting RM sign-off (the confirm gate)
# done     → RM signed off
# dismissed→ RM archived it (not actionable)
TaskStatus = Literal["backlog", "started", "review", "done", "dismissed"]
TaskPriority = Literal["low", "medium", "high"]
# How the agent attempts the task; also picks which deterministic/LLM tool runs.
TaskKind = Literal[
    "email_reply", "investment_review", "research", "schedule", "document", "general",
]
TaskSource = Literal["email", "news", "manual", "system"]


class EmailMessage(BaseModel):
    """One inbound message at the front door. Seed fixtures offline; IMAP/Graph when a key is
    dropped in (see ingestion/email.py). Routed to a client, then mined for tasks."""
    # id + provenance are internal: sources (fixture/IMAP) set them, and a hand-dropped email
    # (POST /ingest/email) gets them synthesised server-side from its content — see ingest_email.
    id: str = ""
    from_name: str = ""
    from_email: str = ""
    to_email: str = ""
    subject: str = ""
    body: str = ""
    received_at: str = ""
    client_id: Optional[str] = None      # resolved by the triage router (may be None = unrouted)
    provenance: Optional[Provenance] = None


class DraftEmail(BaseModel):
    """A ready-to-send reply the RM reviews, edits and sends — never auto-sent (§2)."""
    to_name: str = ""
    to_email: str = ""
    subject: str = ""
    body: str = ""


class TaskArtifact(BaseModel):
    """The agent's work product for a task — what it actually produced with the client's data.
    Everything here is a DRAFT for the RM; carries provenance so the RM can see why."""
    kind: Literal["draft_email", "strategy", "research_note", "analysis", "note"]
    summary: str                          # one line: what the agent did
    body: str = ""                        # markdown deliverable (narrative / analysis / brief)
    draft_email: Optional[DraftEmail] = None
    strategy_proposal: Optional[StrategyProposal] = None
    dialogue: Optional[DialogueSuggestion] = None
    confidence: Literal["high", "medium", "low"] = "medium"
    llm_used: bool = False
    provenance: list[Provenance] = Field(default_factory=list)


class Task(BaseModel):
    """A unit of RM work on the kanban board."""
    id: str
    client_id: Optional[str] = None
    title: str
    detail: str = ""
    kind: TaskKind = "general"
    source: TaskSource = "manual"
    status: TaskStatus = "backlog"
    priority: TaskPriority = "medium"
    created_at: str
    updated_at: str
    dedup_key: Optional[str] = None       # e.g. "email:<id>" / "news:<client>:<news>" — idempotent ingest
    origin: Optional[Provenance] = None   # the email / news item that spawned the task
    artifact: Optional[TaskArtifact] = None  # the agent's attempt
    activity: list[str] = Field(default_factory=list)  # human-readable execution trail
    complex: bool = False                 # left in `started` for the RM to carry forward
    requires_signoff: bool = True         # advisory only — the RM gate
    signed_off_by: Optional[str] = None


class TaskCreateRequest(BaseModel):
    title: str
    detail: str = ""
    client_id: Optional[str] = None
    kind: TaskKind = "general"
    priority: TaskPriority = "medium"
    execute: bool = True                  # let the agent attempt it immediately


class TaskUpdateRequest(BaseModel):
    """RM edits a card: move column, re-prioritise, tweak title/detail."""
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    title: Optional[str] = None
    detail: Optional[str] = None


class TaskSignoffRequest(BaseModel):
    """The confirm gate. RM approves the agent's draft; may hand-edit the deliverable body first."""
    rm_name: str = ""
    edited_body: Optional[str] = None     # RM's final edit of the draft (email/brief), if any


class EmailIngestRequest(BaseModel):
    """Scan the inbox, or drop in a single raw email to triage on the spot."""
    raw_email: Optional[EmailMessage] = None

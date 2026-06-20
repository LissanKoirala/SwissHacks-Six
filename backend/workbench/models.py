"""Frozen shared contracts (CLAUDE.md §7). Every fact and suggestion carries provenance.

These pydantic models are THE seam between streams. Changing a field here is a contract
change — update CLAUDE.md and ping the channel.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

# --- vocabulary types -------------------------------------------------------

SourceType = Literal["crm_log", "news", "cio_list", "portfolio", "mandate", "market_digest"]
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


class Statement(BaseModel):
    """One distilled profile point, with a pointer back to the log line that justifies it."""
    text: str
    provenance: Provenance


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


class Profile(BaseModel):
    """Materialised view rebuilt from the meeting_log."""
    client_id: str
    name: str
    mandate: str  # Defensive / Balanced / Growth
    headline: str
    facets: dict[str, list[Statement]] = Field(default_factory=dict)
    interest_edges: list[InterestEdge] = Field(default_factory=list)


# --- RM Capture (multimodal note → stage → confirm) -------------------------

class CaptureExtractRequest(BaseModel):
    """Raw note (typed, dictated, or OCR'd) → read-only staged draft. No mutation."""
    note: str                       # raw text (typed, dictated, or OCR'd)
    modality: str = "File Note"     # Physical Meeting / Phone Call / Video Call / Email / Lunch / File Note / Physical Event
    contact: str = ""               # who the RM spoke with
    rm_name: str = ""
    date: str = ""                  # ISO yyyy-mm-dd; default = server today if empty


class ProposedEdge(BaseModel):
    """A candidate interest edge the RM can deselect/edit before confirm."""
    topic: str                      # MUST be a TOPIC_VOCAB key
    topic_label: str
    facet: str                      # professional / interests / historical / personality
    polarity: str                   # opportunity / conflict / neutral
    rationale: str                  # short why, quotes the cue
    selected: bool = True           # default-on; RM can deselect/edit


class ProposedFacet(BaseModel):
    """A candidate facet statement the RM can deselect/edit before confirm."""
    facet: str
    text: str
    selected: bool = True


class CaptureConfirmRequest(BaseModel):
    """The RM gate — only the kept (selected) edges/facets are materialised."""
    note: str                       # final (RM-edited) note text
    modality: str
    contact: str = ""
    rm_name: str = ""
    date: str = ""
    edges: list[ProposedEdge] = []  # only the RM-kept ones (selected) are applied
    facets: list[ProposedFacet] = []


# --- News graph -------------------------------------------------------------

class Sentiment(BaseModel):
    score: float  # [-1, 1]
    label: SentimentLabel


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
    provenance: Provenance


# --- Meta graph / match -----------------------------------------------------

class TopicMatch(BaseModel):
    """A shared topic node = the match (set intersection, no LLM). Carries both sides' provenance."""
    topic: str
    client_provenance: Provenance   # the interest edge / log line
    news_provenance: Provenance     # the news tag


class Match(BaseModel):
    id: str
    client_id: str
    polarity: Polarity              # conflict (avoid) or opportunity (reward)
    headline: str
    news: NewsItem
    shared_topics: list[TopicMatch] = Field(default_factory=list)
    affected_holding: Optional[Holding] = None  # the held name the news is about, if any
    why: list[Provenance] = Field(default_factory=list)


# --- Advisory outputs (CLAUDE.md §1: two things) ----------------------------

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
    provenance: list[Provenance] = Field(default_factory=list)


class StrategyProposal(BaseModel):
    """Output 1: same-sector swaps within the mandate, limited to CIO-approved, sentiment-screened
    stocks. Stays inside the rails."""
    client_id: str
    headline: str
    polarity: Polarity
    swaps: list[SwapProposal] = Field(default_factory=list)
    constraints_checked: list[str] = Field(default_factory=list)
    provenance: list[Provenance] = Field(default_factory=list)


class DialogueSuggestion(BaseModel):
    """Output 2: conversation starters in the client's preferred style, mixing client-specific
    signals with light general-market context."""
    client_id: str
    style: str
    talking_points: list[Statement] = Field(default_factory=list)
    draft_message: str
    market_context: list[Statement] = Field(default_factory=list)
    provenance: list[Provenance] = Field(default_factory=list)


# --- API contract (CLAUDE.md §7.4) -----------------------------------------

class ClientSummary(BaseModel):
    client_id: str
    name: str
    mandate: str
    headline: str
    alert_count: int = 0


class ClientInsights(BaseModel):
    """GET /clients/{id}/insights"""
    client: ClientSummary
    matches: list[Match] = Field(default_factory=list)
    strategy_proposal: Optional[StrategyProposal] = None
    dialogue_suggestion: Optional[DialogueSuggestion] = None
    generated_at: str
    llm_used: bool = False

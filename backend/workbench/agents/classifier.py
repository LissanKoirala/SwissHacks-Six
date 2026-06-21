"""Classify-once worker (CLAUDE.md §8/§9). Tag each news item against the topic vocabulary and
attach sentiment ONCE, shared across all clients. Cheap/deterministic by default (keywords);
never a per-client LLM call. Also labels the CIO approved universe with sentiment + ethics tags."""
from __future__ import annotations

from ..ingestion.base import Record
from ..models import CIOStock, Fundamentals, InsiderTrade, NewsItem, Provenance, Sentiment
from ..topics import classify_text

# Single source of truth for the sentiment threshold — shared with the matcher's polarity logic
# (matcher reads the resulting label, never re-thresholds the raw score). Finding #5.
SENTIMENT_THRESHOLD = 0.2


def sentiment_label(score: float) -> str:
    if score > SENTIMENT_THRESHOLD:
        return "BULLISH"
    if score < -SENTIMENT_THRESHOLD:
        return "BEARISH"
    return "NEUTRAL"


def make_sentiment(score: float, origin: str) -> Sentiment:
    """Build a Sentiment that carries *why* it reads the way it does: the upstream feed that
    supplied the score and the ±0.2 threshold that turned it into a label. Cited once, here, so
    no per-client re-derivation is ever needed (CLAUDE.md §9) and the RM can audit it (§2)."""
    return Sentiment(
        score=round(score, 3),
        label=sentiment_label(score),
        source=f"{origin} · |score|>{SENTIMENT_THRESHOLD}",
    )


def to_news_item(rec: Record) -> NewsItem:
    p = rec.payload
    title = p.get("title", "")
    body = p.get("body", "")
    topics = classify_text(f"{title}. {body}")
    score = float(p.get("sentiment") or 0.0)
    # Each signal cites its true origin (news/sec_filing/esg/earnings/analyst/macro) so the
    # provenance badge is honest. Falls back to "news" for the legacy fixtures (#7.5).
    signal_type = p.get("signal_type") or rec.source_type or "news"
    # Never surface an uncited fact: fall back the excerpt to source/url if there's no text (#9).
    excerpt = (body or title or p.get("source") or p.get("url") or p["id"])[:240]
    return NewsItem(
        id=p["id"],
        title=title,
        body=body,
        source=p.get("source", "Unknown"),
        url=p.get("url"),
        published_at=p.get("published_at", ""),
        topics=topics,
        sentiment=make_sentiment(score, p.get("source") or signal_type),
        issuer_name=p.get("issuer_name"),
        issuer_isin=p.get("issuer_isin"),
        market_digest=bool(p.get("market_digest", False)),
        signal_type=signal_type,
        provenance=Provenance(
            source_type=signal_type,
            source_id=p["id"],
            excerpt=excerpt,
            url=p.get("url"),
            timestamp=p.get("published_at"),
        ),
    )


def to_fundamentals(rec: Record) -> Fundamentals:
    """Build a Fundamentals node (reference data) from a fundamentals Record, including any
    Form-4 insider trades joined upstream by ISIN."""
    p = rec.payload
    trades = [
        InsiderTrade(
            insider=t["insider"], role=t.get("role"), transaction=t["transaction"],
            shares=t.get("shares"), value_usd=t.get("value_usd"), date=t["date"],
            provenance=Provenance(
                source_type="insider", source_id=f"{p['isin']}:{t['date']}:{t['transaction']}",
                excerpt=f"{t['insider']} {t['transaction']} {t.get('shares','?')} shares on {t['date']}.",
                url=t.get("url"), timestamp=t["date"],
            ),
        )
        for t in p.get("insider_trades", [])
    ]
    return Fundamentals(
        isin=p["isin"], issuer=p["issuer"], as_of=p.get("as_of"), currency=p.get("currency"),
        pe_ratio=p.get("pe_ratio"), dividend_yield=p.get("dividend_yield"),
        next_ex_dividend=p.get("next_ex_dividend"), market_cap=p.get("market_cap"),
        week52_high=p.get("week52_high"), week52_low=p.get("week52_low"),
        insider_summary=p.get("insider_summary"), insider_trades=trades,
        provenance=Provenance(
            source_type="fundamentals", source_id=p["isin"], excerpt=rec.excerpt,
            timestamp=p.get("as_of"),
        ),
    )


def label_cio(rec: Record, labels: dict) -> CIOStock:
    """Build a CIOStock and join sentiment/value tags from the labelled-stocks table."""
    p = rec.payload
    lab = labels.get(p["isin"], {})
    score = lab.get("sentiment")
    sentiment = None
    if score is not None:
        sentiment = make_sentiment(float(score), "stock-labels")
    return CIOStock(
        rating=p["rating"],
        asset_class=p.get("asset_class"),
        sub_asset_class=p.get("sub_asset_class"),
        region=p.get("region"),
        industry_group=p.get("industry_group"),
        issuer=p["issuer"],
        security=p.get("security"),
        isin=p["isin"],
        cio_view=p.get("cio_view"),
        valor=p.get("valor"),
        mic=p.get("mic"),
        yahoo=p.get("yahoo"),
        sentiment=sentiment,
        value_tags=list(lab.get("value_tags", [])),
        provenance=Provenance(
            source_type="cio_list",
            source_id=p["isin"],
            excerpt=rec.excerpt,
        ),
    )

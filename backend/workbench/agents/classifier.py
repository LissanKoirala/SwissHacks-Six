"""Classify-once worker (CLAUDE.md §8/§9). Tag each news item against the topic vocabulary and
attach sentiment ONCE, shared across all clients. Cheap/deterministic by default (keywords);
never a per-client LLM call. Also labels the CIO approved universe with sentiment + ethics tags."""
from __future__ import annotations

from ..ingestion.base import Record
from ..models import CIOStock, NewsItem, Provenance, Sentiment
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


def to_news_item(rec: Record) -> NewsItem:
    p = rec.payload
    title = p.get("title", "")
    body = p.get("body", "")
    topics = classify_text(f"{title}. {body}")
    score = float(p.get("sentiment") or 0.0)
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
        sentiment=Sentiment(score=round(score, 3), label=sentiment_label(score)),
        issuer_name=p.get("issuer_name"),
        issuer_isin=p.get("issuer_isin"),
        market_digest=bool(p.get("market_digest", False)),
        provenance=Provenance(
            source_type="news",
            source_id=p["id"],
            excerpt=excerpt,
            url=p.get("url"),
            timestamp=p.get("published_at"),
        ),
    )


def label_cio(rec: Record, labels: dict) -> CIOStock:
    """Build a CIOStock and join sentiment/value tags from the labelled-stocks table."""
    p = rec.payload
    lab = labels.get(p["isin"], {})
    score = lab.get("sentiment")
    sentiment = None
    if score is not None:
        sentiment = Sentiment(score=round(float(score), 3), label=sentiment_label(float(score)))
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

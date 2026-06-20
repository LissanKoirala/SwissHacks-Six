"""Match (CLAUDE.md §3/§8.D). A match is a shared topic node — set intersection over the meta
graph, NO LLM call (token discipline, §9). Produces fully-cited Match objects that say *why* an
item surfaced for *this* client."""
from __future__ import annotations

from ..graph.store import World
from ..models import Match, NewsItem, Provenance, TopicMatch
from ..topics import topic_label


def _polarity(edges, news: NewsItem) -> str:
    """Decide the stance from the client's edges + the news' *label* (single threshold, #5/#6)."""
    has_conflict = any(e.polarity == "conflict" for e in edges)
    has_opportunity = any(e.polarity == "opportunity" for e in edges)
    pos = news.sentiment.label == "BULLISH"
    neg = news.sentiment.label == "BEARISH"
    if has_opportunity and pos:
        return "opportunity"          # a held/approved name did the good thing — reward it
    if has_conflict and neg:
        return "conflict"             # a negative event on an avoided topic
    if has_conflict and news.issuer_isin is None:
        return "conflict"             # a market/recommendation push toward the avoided topic (Räber)
    if has_conflict and pos:
        return "neutral"              # good news on a topic the client only avoids — informational
    if has_conflict:
        return "conflict"
    return "opportunity" if has_opportunity else "neutral"


def match_client(world: World, client_id: str) -> list[Match]:
    edges = world.interest_by_client.get(client_id, [])
    client_topics = {e.topic for e in edges}
    held = world.held_isins(client_id)
    matches: list[Match] = []

    for news in world.news:
        if news.market_digest:
            continue  # general market info seeds DIALOGUE, never strategy matching (§2, #10)
        shared = client_topics & set(news.topics)
        if not shared:
            continue

        topic_edges = [e for e in edges if e.topic in shared]
        polarity = _polarity(topic_edges, news)

        # One TopicMatch per shared topic (#1). When a client has several edges on a topic,
        # cite the one whose polarity matches the decision (fall back to the heaviest).
        shared_topics = []
        why: list[Provenance] = []
        for topic in sorted(shared):
            tedges = [e for e in topic_edges if e.topic == topic]
            chosen = next((e for e in tedges if e.polarity == polarity), None) \
                or max(tedges, key=lambda e: e.weight)
            shared_topics.append(TopicMatch(
                topic=topic,
                client_provenance=chosen.provenance,
                news_provenance=news.provenance,
            ))
            why.append(chosen.provenance)
        why.append(news.provenance)

        affected = None
        if news.issuer_isin and news.issuer_isin in held:
            affected = world.holding_by_isin(client_id, news.issuer_isin)
            if affected:
                why.append(Provenance(
                    source_type="portfolio",
                    source_id=f"{affected.portfolio}:{affected.isin}",
                    excerpt=f"Holds {affected.issuer} ({affected.isin}) — "
                            f"CHF {affected.current_chf:,.0f} in the {affected.portfolio} mandate.",
                ))

        labels = sorted({topic_label(t) for t in shared})
        if polarity == "conflict":
            verb = "conflicts with" if affected is None else "puts a holding in conflict with"
            headline = f"{news.issuer_name or 'A market signal'} {verb} this client's stance on {', '.join(labels)}."
        elif polarity == "opportunity":
            headline = f"{news.issuer_name or 'A company'} just acted on {', '.join(labels)} — a values-aligned opportunity to surface."
        else:
            headline = f"{news.issuer_name or 'A development'} relates to this client's interest in {', '.join(labels)} — worth a mention."

        matches.append(Match(
            id=f"{client_id}:{news.id}",
            client_id=client_id,
            polarity=polarity,
            headline=headline,
            news=news,
            shared_topics=shared_topics,
            affected_holding=affected,
            why=why,
        ))

    # salience: conflicts with a held position first, then opportunities, then the rest
    def rank(m: Match):
        return (
            0 if (m.polarity == "conflict" and m.affected_holding) else
            1 if m.affected_holding else
            2 if m.polarity == "opportunity" else 3,
            -abs(m.news.sentiment.score),
        )

    matches.sort(key=rank)
    return matches

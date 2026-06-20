"""Opportunity discovery pass (CLAUDE.md §8.D — the spec's HI3 capability).

Today the advisory agent only proposes REPLACEMENTS for names a client already holds (a swap on a
conflict, an overweight on an opportunity match). This standing pass does the complementary job:
it surfaces *new, unheld* CIO-BUY names that fit the client's documented DNA, so the RM can pitch
genuine opportunities rather than only react to triggers.

It is a pure index scan over the meta graph — interest edges ∩ the labelled CIO universe (set
intersection, NO LLM call per client). Classify/label happens once upstream (the CIO list carries
value_tags + sentiment); matching here is a cheap lookup, in line with the token-discipline rules
(CLAUDE.md §9). Every surfaced opportunity is fully cited: the CIO list row that approved it, plus
the interest-edge log line(s) that justify the fit.
"""
from __future__ import annotations

from ..graph.store import World
from ..models import CIOStock, InterestEdge, Provenance
from ..topics import topic_label
from .advisory import TOPIC_PREFERENCES


def _is_cash(isin: str | None) -> bool:
    """Cash pseudo-positions never belong in the BUY universe."""
    return (isin or "").lower().startswith("cash")


def build_opportunities(world: World, client_id: str, limit: int = 5) -> list[dict]:
    """Surface up to `limit` CIO-BUY names the client does NOT hold, ranked by how well their
    value tags fit the client's documented preferences. Pure index scan, fully cited, no LLM."""
    edges = world.interest_by_client.get(client_id, [])

    # 1. Split the client's interest edges by polarity into the value screen.
    #    desired = tags the client wants more of; avoid = tags that disqualify a name.
    #    Keep, per opportunity topic, the edge that justifies it (for provenance + alignment labels).
    desired_tags: set[str] = set()
    avoid_tags: set[str] = set()
    # opp_topic_edge: topics the client actively wants more of (opportunity edges).
    # comp_topic_edge: topics the client is averse to, but whose *acceptable substitute* tags
    #   they've documented respect for — e.g. Räber rejects abstract US-tech/AI yet respects
    #   tangible hardware (ASML). Crediting these as alignment lets the proactive pass propose the
    #   compromise the persona explicitly asks for, instead of staying silent. (DeepDive persona 3.)
    opp_topic_edge: dict[str, InterestEdge] = {}
    comp_topic_edge: dict[str, InterestEdge] = {}
    for e in edges:
        prefs = TOPIC_PREFERENCES.get(e.topic)
        if not prefs:
            continue
        want, avoid, _fallback_sector = prefs
        if e.polarity == "opportunity":
            desired_tags.update(want)
            opp_topic_edge.setdefault(e.topic, e)  # first edge per topic carries the citation
        elif e.polarity == "conflict":
            avoid_tags.update(avoid)
            comp_topic_edge.setdefault(e.topic, e)
    # An acceptable-substitute tag only counts as alignment if the client hasn't *also* flagged it
    # as something to avoid (avoid always wins).
    compromise_tags: set[str] = set()
    for topic in comp_topic_edge:
        want, _avoid, _sec = TOPIC_PREFERENCES.get(topic, ([], [], None))
        compromise_tags.update(t for t in want if t not in avoid_tags)

    seed_name = world.clients.get(client_id, {}).get("name", client_id)

    # 2. Candidate universe = CIO BUYs the client does not already hold (and not cash).
    held = world.held_isins(client_id)
    candidates = [
        c for c in world.cio
        if c.rating == "BUY" and c.isin not in held and not _is_cash(c.isin)
    ]

    # 3. Score on the value fit; never surface something tagged with an avoided value.
    scored: list[tuple[float, CIOStock]] = []
    for c in candidates:
        tags = set(c.value_tags)
        if tags & avoid_tags:  # the client has told us to avoid this — drop, don't rank
            continue
        # Desired tags score full; acceptable-substitute (compromise) tags score a notch lower so a
        # name the client actively wants outranks a tolerated alternative.
        score = 2.0 * len(tags & desired_tags) + 1.5 * len(tags & compromise_tags)
        if c.sentiment:
            score += c.sentiment.score
        if score <= 0:  # only surface a positive, defensible fit
            continue
        scored.append((score, c))

    # 4. Best fits first, then cap.
    scored.sort(key=lambda sc: sc[0], reverse=True)
    top = scored[:limit]

    out: list[dict] = []
    for score, c in top:
        tags = set(c.value_tags)
        # 5. Which of the client's OPPORTUNITY topics does this name actually satisfy? (its labels
        #    + the edge provenance that earns the citation).
        alignment_topics: list[str] = []
        edge_provs: list[Provenance] = []
        compromise = False
        for topic, edge in opp_topic_edge.items():
            want, _avoid, _sec = TOPIC_PREFERENCES.get(topic, ([], [], None))
            if tags & set(want):
                alignment_topics.append(topic_label(topic))
                edge_provs.append(edge.provenance)
        # Acceptable-substitute alignment: a tolerated alternative within an averse topic.
        for topic, edge in comp_topic_edge.items():
            want, _avoid, _sec = TOPIC_PREFERENCES.get(topic, ([], [], None))
            if (tags & set(want) & compromise_tags) and topic_label(topic) not in alignment_topics:
                alignment_topics.append(topic_label(topic))
                edge_provs.append(edge.provenance)
                compromise = True

        tag_str = ", ".join(c.value_tags) if c.value_tags else "sentiment-positive"
        if alignment_topics and compromise:
            reason = (f"{c.issuer} is a CIO BUY labelled {tag_str} — the kind of acceptable substitute "
                      f"{seed_name} respects within {', '.join(alignment_topics)}, rather than the exposure "
                      f"they've asked us to avoid.")
        elif alignment_topics:
            reason = (f"{c.issuer} is a CIO BUY labelled {tag_str} — aligned with {seed_name}'s "
                      f"documented interest in {', '.join(alignment_topics)}.")
        else:
            # No opportunity topic to cite (e.g. a client with avoidances only): surface it as a
            # screened, sentiment-positive BUY that clears the client's value screen.
            reason = (f"{c.issuer} is a CIO BUY labelled {tag_str}, sentiment-positive and clear of "
                      f"{seed_name}'s documented avoidances.")

        # 6. Provenance: the CIO list row first, then each aligning interest-edge log line.
        provenance = [c.provenance.model_dump()] + [p.model_dump() for p in edge_provs]

        out.append({
            "isin": c.isin,
            "issuer": c.issuer,
            "industry_group": c.industry_group,
            "sub_asset_class": c.sub_asset_class,
            "region": c.region,
            "rating": c.rating,
            "valor": c.valor,
            "mic": c.mic,
            "value_tags": list(c.value_tags),
            "sentiment": (c.sentiment.score if c.sentiment else None),
            "hist_vol_30d": c.hist_vol_30d,
            "risk_source": c.risk_source,
            "alignment_topics": alignment_topics,
            "alignment_reason": reason,
            "score": round(score, 2),
            "provenance": provenance,
        })

    return out

"""Locks the golden-rule invariants (CLAUDE.md §2) and the four persona vertical slices (§11/§12)."""
from workbench.agents.orchestrator import get_insights


def test_world_builds(world):
    assert set(world.clients) == {"schneider", "huber", "raeber", "ammann"}
    assert len(world.cio) > 100
    assert all(len(v) > 15 for v in world.meeting_logs.values())
    # every CIO name carries a rating in the approved vocabulary
    assert all(c.rating in ("BUY", "HOLD", "SELL") for c in world.cio)


def test_news_classified_once(world):
    biogen = next(n for n in world.news if n.issuer_isin == "US09062X1037")
    assert "neuro-research" in biogen.topics
    assert biogen.sentiment.label == "BEARISH"
    unilever = next(n for n in world.news if n.issuer_isin == "GB00B10RZP78")
    assert "esg-deforestation" in unilever.topics
    assert unilever.sentiment.label == "BULLISH"


def test_traceability_everything_cited(world):
    """If you can't cite it, don't surface it (§2)."""
    for cid in world.clients:
        ins = get_insights(world, cid)
        for m in ins.matches:
            assert m.why, f"{cid} match has no provenance"
            for tm in m.shared_topics:
                assert tm.client_provenance.excerpt
                assert tm.news_provenance.excerpt
        if ins.strategy_proposal:
            assert ins.strategy_proposal.provenance
            for s in ins.strategy_proposal.swaps:
                assert s.rationale
        if ins.dialogue_suggestion:
            assert ins.dialogue_suggestion.draft_message
            for p in ins.dialogue_suggestion.talking_points:
                assert p.provenance.excerpt


def test_strategy_stays_inside_rails(world):
    """Swaps may only BUY CIO-approved BUY-rated names, same sector (§2)."""
    for cid in world.clients:
        ins = get_insights(world, cid)
        if not ins.strategy_proposal:
            continue
        for s in ins.strategy_proposal.swaps:
            if s.buy_isin:
                cio = world.cio_by_isin.get(s.buy_isin)
                assert cio is not None, f"{cid} buys non-CIO name {s.buy_isin}"
                assert cio.rating == "BUY", f"{cid} buys non-BUY {cio.issuer}"
            assert s.same_sector


def test_schneider_divests_research_abandoner(world):
    ins = get_insights(world, "schneider")
    m = ins.matches[0]
    assert m.polarity == "conflict"
    assert m.affected_holding.isin == "US09062X1037"  # Biogen
    swap = ins.strategy_proposal.swaps[0]
    assert swap.action == "SWAP"
    assert swap.sell_isin == "US09062X1037"
    buy = world.cio_by_isin[swap.buy_isin]
    assert buy.industry_group == "Health Care"
    assert "neuro-research-commitment" in buy.value_tags
    assert "neuro-research-retreat" not in buy.value_tags
    assert swap.drift_safe  # same sub-asset-class


def test_huber_rewards_leadership(world):
    ins = get_insights(world, "huber")
    m = ins.matches[0]
    assert m.polarity == "opportunity"
    assert m.affected_holding.isin == "GB00B10RZP78"  # Unilever
    swap = ins.strategy_proposal.swaps[0]
    assert swap.action in ("SWAP", "INCREASE", "HOLD")
    assert swap.buy_isin == "GB00B10RZP78"  # rotate INTO Unilever
    assert swap.drift_safe  # funded within the same sleeve


def test_raeber_resists_us_tech(world):
    ins = get_insights(world, "raeber")
    m = ins.matches[0]
    assert m.polarity == "conflict"
    assert m.affected_holding is None  # market/CIO push, not a held name
    actions = [s.action for s in ins.strategy_proposal.swaps]
    assert "HOLD" in actions
    buys = [s.buy_isin for s in ins.strategy_proposal.swaps if s.buy_isin]
    assert "NL0010273215" in buys  # ASML — the tangible name he respects


def test_ammann_dumps_labour_risk(world):
    ins = get_insights(world, "ammann")
    m = ins.matches[0]
    assert m.polarity == "conflict"
    assert m.affected_holding.isin == "US7223041028"  # PDD
    swap = ins.strategy_proposal.swaps[0]
    assert swap.sell_isin == "US7223041028"
    buy = world.cio_by_isin[swap.buy_isin]
    assert buy.industry_group == "Consumer Discretionary"
    assert not (set(buy.value_tags) & {"labour-risk", "supply-chain-governance-risk"})


def test_mandate_drift_breaches_present(world):
    """Balanced & Growth carry deliberate ±2.0pp breaches (data design)."""
    breaches = {name: any(t.breach for t in m.targets) for name, m in world.mandates.items()}
    assert breaches.get("Balanced") or breaches.get("Growth")


def test_no_duplicate_shared_topics(world):
    """Each match cites each topic once, even with multiple edges on it (review #1)."""
    for cid in world.clients:
        for m in get_insights(world, cid).matches:
            topics = [t.topic for t in m.shared_topics]
            assert len(topics) == len(set(topics)), f"{cid} has duplicate shared_topics {topics}"


def test_same_sector_is_computed_not_asserted(world):
    """same_sector reflects the real sectors of sold vs bought name (review #2)."""
    for cid in world.clients:
        ins = get_insights(world, cid)
        if not ins.strategy_proposal:
            continue
        for s in ins.strategy_proposal.swaps:
            if s.sell_isin and s.buy_isin:
                sell = world.cio_by_isin.get(s.sell_isin)
                buy = world.cio_by_isin.get(s.buy_isin)
                if sell and buy:
                    assert s.same_sector == (sell.industry_group == buy.industry_group)


def test_drift_is_computed(world):
    """Cross-sub-asset-class swaps carry an actual post-swap drift figure, not prose (review #3)."""
    ins = get_insights(world, "ammann")
    constraints = " ".join(ins.strategy_proposal.constraints_checked)
    assert "pp" in constraints and ("within" in constraints or "BREACHES" in constraints)
    # Schneider's swap is same sub-asset-class -> genuinely drift-neutral
    assert get_insights(world, "schneider").strategy_proposal.swaps[0].drift_safe


def test_market_digest_never_drives_strategy(world):
    """General market info seeds dialogue, not strategy matching (§2, review #10)."""
    digest_ids = {n.id for n in world.news if n.market_digest}
    for cid in world.clients:
        for m in get_insights(world, cid).matches:
            assert m.news.id not in digest_ids


def test_cache_is_per_world(world):
    """Two distinct worlds must not share cached insights (review #7)."""
    from workbench.seed import build_world
    w2 = build_world()
    a = get_insights(world, "schneider")
    b = get_insights(w2, "schneider")
    assert a is not b

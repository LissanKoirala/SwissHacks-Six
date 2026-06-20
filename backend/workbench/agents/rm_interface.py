"""RM Interface agent (ST1 — the multi-agent slide's 'RM can query, ask for context, request
alternatives. Conversational and explainable.').

Two query modes, both advisory-only (never instructs a trade):
  • 'alternative' — re-rank the CIO universe for the next-best same-sector, values- and risk-screened
    BUY, excluding the one already proposed (the ranked list already exists in select_swap_candidate;
    only the top pick is used by the proposal — this surfaces the runner-up);
  • 'context'     — an explainable answer over the proposal + its provenance (lazy LLM, deterministic
    fallback, so it runs offline and spends a token only when the RM actually asks).
"""
from __future__ import annotations

from typing import Optional

from ..graph.store import World
from . import llm
from .advisory import (
    _prefs_for_match,
    _substitution_metrics,
    build_strategy,
    select_swap_candidate,
)
from .matcher import match_client

_ALT_CUES = ("alternative", "another", "different", "other option", "instead",
             "swap out", "replace", "else")


def _find_match(world: World, client_id: str, match_id: Optional[str]):
    matches = match_client(world, client_id)
    if match_id:
        for m in matches:
            if m.id == match_id:
                return m
    return matches[0] if matches else None


def answer_query(world: World, client_id: str, *, match_id: Optional[str] = None,
                 question: str = "", exclude_isin: Optional[str] = None) -> dict:
    m = _find_match(world, client_id, match_id)
    if m is None:
        return {"kind": "none", "question": question, "answer": None, "alternative": None,
                "llm_used": False, "provenance": []}

    q = (question or "").lower()
    wants_alt = bool(exclude_isin) or any(c in q for c in _ALT_CUES)
    affected = m.affected_holding

    # --- alternative candidate ------------------------------------------------
    if wants_alt and affected is not None:
        sp = build_strategy(world, client_id, m)
        current_buy = next((s.buy_isin for s in sp.swaps
                            if s.buy_isin and s.sell_isin == affected.isin), None)
        block = {x for x in (exclude_isin, current_buy) if x}
        desired, avoid, fallback = _prefs_for_match(m)
        sector = affected.industry_group or fallback or ""
        cand = select_swap_candidate(world, client_id, sector, desired, avoid, affected.isin,
                                     affected.sub_asset_class, target_vol=affected.hist_vol_30d,
                                     also_exclude=block)
        if cand is None:
            return {"kind": "alternative", "question": question, "alternative": None,
                    "answer": f"No other BUY-rated {sector} name clears the values and risk screen — "
                              f"the original recommendation remains the best same-sector fit.",
                    "llm_used": False, "provenance": []}
        sub = _substitution_metrics(world, client_id, affected, cand, round(affected.current_chf, 2))
        return {
            "kind": "alternative", "question": question,
            "answer": (f"An alternative same-sector BUY is {cand.issuer} "
                       f"({', '.join(cand.value_tags) or 'sentiment-positive'}). "
                       f"30-day volatility {sub.vol_buy:.0%} vs {sub.vol_sell:.0%} on {affected.issuer}."),
            "alternative": {
                "buy_isin": cand.isin, "buy_issuer": cand.issuer,
                "industry_group": cand.industry_group,
                "rationale": (f"Swap {affected.issuer} → {cand.issuer}: same sector, CIO BUY, labelled "
                              f"{', '.join(cand.value_tags) or 'sentiment-positive'}, comparable risk."),
                "substitution": sub.model_dump(),
                "provenance": [p.model_dump() for p in (list(m.why) + [cand.provenance])],
            },
            "llm_used": False,
        }

    # --- context answer -------------------------------------------------------
    sp = build_strategy(world, client_id, m)
    base = sp.swaps[0].rationale if sp.swaps else m.headline
    answer = base
    used_llm = False
    if llm.llm_available():
        prose = llm.chat(
            system=("You are answering a private-bank relationship manager's question about a proposed, "
                    "ADVISORY-ONLY portfolio action. Be concise and factual, cite only the given facts, "
                    "and never instruct the client or RM to trade. 60-90 words, UK spelling."),
            user=(f"Situation: {m.headline}\nProposal rationale: {base}\n"
                  f"Constraints checked: {sp.constraints_checked}\nRM question: {question}\n"
                  f"Answer the RM."),
            max_tokens=220,
        )
        if prose:
            answer = prose.strip()
            used_llm = True
    return {"kind": "context", "question": question, "answer": answer, "alternative": None,
            "llm_used": used_llm, "provenance": [p.model_dump() for p in m.why]}

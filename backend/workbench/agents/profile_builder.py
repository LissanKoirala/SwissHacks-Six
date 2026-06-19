"""CRM agent (CLAUDE.md §8.B). Materialise the four-facet profile + interest edges from the
meeting_log. Each profile fact and interest edge carries a pointer back to the log line that
justifies it (traceability, §2). Deterministic; an optional LLM pass can polish the headline."""
from __future__ import annotations

from typing import Optional

from ..models import InterestEdge, MeetingLogEntry, Profile, Provenance, Statement


def _find_log(logs: list[MeetingLogEntry], date: str) -> Optional[MeetingLogEntry]:
    for e in logs:
        if e.timestamp == date:
            return e
    return None


def _provenance(logs: list[MeetingLogEntry], date: str, excerpt: str) -> Provenance:
    entry = _find_log(logs, date)
    if entry:
        return Provenance(
            source_type="crm_log",
            source_id=entry.id,
            excerpt=excerpt,
            timestamp=entry.timestamp,
        )
    # fall back to citing the date even if the exact row wasn't found
    return Provenance(source_type="crm_log", source_id=f"crm:{date}", excerpt=excerpt, timestamp=date)


def build_profile(seed: dict, logs: list[MeetingLogEntry]) -> Profile:
    client_id = seed["client_id"]

    edges: list[InterestEdge] = []
    for e in seed.get("interest_edges", []):
        edges.append(InterestEdge(
            client_id=client_id,
            topic=e["topic"],
            facet=e.get("facet", "interests"),
            polarity=e["polarity"],
            weight=float(e.get("weight", 1.0)),
            provenance=_provenance(logs, e["date"], e["quote"]),
        ))

    facets: dict[str, list[Statement]] = {}
    for facet_name, points in seed.get("facets", {}).items():
        facets[facet_name] = [
            Statement(text=pt["text"], provenance=_provenance(logs, pt["date"], pt["text"]))
            for pt in points
        ]

    return Profile(
        client_id=client_id,
        name=seed["name"],
        mandate=seed["mandate"],
        headline=seed.get("headline", ""),
        facets=facets,
        interest_edges=edges,
    )

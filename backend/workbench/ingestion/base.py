"""Common adapter interface (CLAUDE.md §6). One adapter per source, swappable mock <-> live,
all emitting the same Record shape so ingestion writes to the graph at one normalisation point."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class Record:
    """The single normalised shape every adapter emits."""
    kind: str                      # "meeting_log" | "news" | "holding" | "cio" | "mandate" | "price"
    source_type: str               # maps to Provenance.source_type
    source_id: str
    payload: dict[str, Any] = field(default_factory=dict)
    excerpt: str = ""


class Source(Protocol):
    name: str

    def fetch(self, query: Any = None) -> list[Record]:
        ...

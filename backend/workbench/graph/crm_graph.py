"""CRM knowledge graph (ported from crm-graph/build_graph.py into the backend).

Turns a client's immutable meeting_log into an Obsidian-style node/link graph:
  RM -> client household -> people -> interactions -> {medium, theme}
Themes are keyword-tagged cross-client topics. Served per client at /clients/{id}/graph and
rendered as a force-directed canvas in the dashboard's Network view."""
from __future__ import annotations

import re

from .store import World

# Curated cross-client themes: title -> lowercase substrings to match in the note text.
THEMES = {
    "Capital Preservation": ["preservation", "preserv", "conservative", "sleep at night", "steward", "defensive"],
    "Dividends / Income": ["dividend", "payout", "cash flow", "cashflow", "income", "yield", "coupon"],
    "ESG / Sustainability": ["esg", "sustainab", "biodiversity", "reforest", "nature", "greenwash",
                             "ecosystem", "ngo", "philanthrop", "deforest", "palm oil"],
    "Supply-Chain Governance": ["supply-chain", "supply chain", "sweatshop", "labor", "labour",
                                "wage theft", "governance liabilit", "exploitation"],
    "Succession Planning": ["succession", "grandchildren", "wealth transmission", "transmission", "children"],
    "Liquidity Event": ["withdrawal", "capital call", "deposit", "renovation", "acquisition", "top-up", "endowment"],
    "Anti-Speculation": ["speculat", "high-beta", "bubble", "tail risk", "asymmetric", "hype"],
    "Reputation Risk": ["reputation", "hypocrisy", "backlash", "public face", "brand equity", "name is linked"],
    "Health / Family": ["parkinson", "diagnos", "disease", "neuro", "daughter", "chloe", "medical"],
}

TYPE_COLOR = {
    "rm": "#e0b3ff", "client": "#ffd166", "person": "#4cc9f0",
    "medium": "#76c893", "interaction": "#9aa0b5", "theme": "#f08080",
}

# Emoji icons surfaced on medium / theme / interaction nodes (PORT_CONTRACT §3).
MEDIUM_ICON = {
    "Physical Meeting": "🤝", "Phone Call": "☎️", "Video Call": "📹",
    "Email": "✉️", "File Note": "📝", "Lunch": "🍽️", "Physical Event": "🎟️",
}
MEDIUM_ICON_DEFAULT = "📌"

THEME_ICON = {
    "Capital Preservation": "🛡️", "Dividends / Income": "💰",
    "ESG / Sustainability": "🌱", "Reputation Risk": "⚠️",
    "Succession Planning": "👪", "Supply-Chain Governance": "🔗",
    "Anti-Speculation": "🎢", "Liquidity Event": "💧", "Health / Family": "🩺",
}
THEME_ICON_DEFAULT = "🏷️"

# Avatar photos vendored under frontend/public/faces/ — keyed by ascii-folded slug.
AVATAR_SLUGS = {
    "eugen-raeber", "lisa-raeber", "hubertus-schneider", "carmen-schneider",
    "marius-huber", "elena-huber", "julian-ammann", "thomas-keller",
}

# Structural (non-interaction) links get a steady, fairly strong weight.
STRUCTURAL_STRENGTH = 0.85


def _slugify(name: str) -> str:
    """Ascii-fold a full name to a faces/ slug. German umlauts expand the way the
    vendored filenames do (Räber → raeber): ä→ae ö→oe ü→ue ß→ss; é/è/ê→e.
    Spaces/punctuation collapse to single hyphens."""
    folded = (
        (name or "")
        .lower()
        .replace("ä", "ae").replace("ö", "oe").replace("ü", "ue")
        .replace("é", "e").replace("è", "e").replace("ê", "e")
        .replace("á", "a").replace("à", "a")
        .replace("ó", "o").replace("ò", "o")
        .replace("ß", "ss")
        .strip()
    )
    return re.sub(r"[^a-z0-9]+", "-", folded).strip("-")


def _first_name(name: str) -> str:
    return (name or "").strip().split()[0] if (name or "").strip() else ""


def _avatar_for(name: str) -> str | None:
    slug = _slugify(name)
    return f"/faces/{slug}.jpg" if slug in AVATAR_SLUGS else None


def _people(contact: str, family: str) -> list[str]:
    contact = (contact or "").strip()
    if not contact or "internal" in contact.lower():
        return []
    parts = re.split(r"\s*&\s*|\s+and\s+", contact)
    out = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        out.append(p if len(p.split()) > 1 or family.split()[0] in p else f"{p} {family}")
    return out


def _recency_scale(logs: list) -> dict[str, float]:
    """Map each distinct interaction timestamp to a 0..1 recency score for this
    client (oldest → 0, most recent → 1). Single-log clients collapse to 1.0."""
    stamps = sorted({(e.timestamp or "") for e in logs if (e.timestamp or "")})
    if not stamps:
        return {}
    if len(stamps) == 1:
        return {stamps[0]: 1.0}
    span = len(stamps) - 1
    return {ts: i / span for i, ts in enumerate(stamps)}


def build_crm_graph(world: World, client_id: str) -> dict:
    meta = world.clients.get(client_id, {})
    family = meta.get("name", client_id).split()[-1]  # surname
    logs = world.meeting_logs.get(client_id, [])
    recency_of = _recency_scale(logs)

    nodes: dict[str, dict] = {}
    links: list[dict] = []
    seen: set = set()

    def node(nid: str, **attrs) -> str:
        if nid not in nodes:
            nodes[nid] = {"id": nid, **attrs}
        return nid

    def link(a: str, b: str, strength: float = STRUCTURAL_STRENGTH,
             recency: float = STRUCTURAL_STRENGTH) -> None:
        key = (a, b) if a < b else (b, a)
        if a != b and key not in seen:
            seen.add(key)
            links.append({
                "source": a,
                "target": b,
                "strength": round(max(0.0, min(1.0, strength)), 3),
                "recency": round(max(0.0, min(1.0, recency)), 3),
            })

    rm_name = logs[0].rm_name if logs and logs[0].rm_name else "Relationship Manager"
    rm = node("rm:Thomas Keller", label=rm_name, type="rm",
              detail="Relationship manager for the household.",
              avatar=_avatar_for(rm_name), first_name=_first_name(rm_name) or None)
    fam = node(f"client:{family}", label=f"{meta.get('name', family)}", type="client",
               detail=meta.get("headline", f"{family} household."))
    link(rm, fam)

    for i, e in enumerate(logs, 1):
        rec = recency_of.get(e.timestamp or "", STRUCTURAL_STRENGTH)
        for person in _people(e.contact, family):
            pid = node(f"person:{person}", label=person, type="person",
                       detail=f"{family} household member.",
                       avatar=_avatar_for(person), first_name=_first_name(person) or None)
            link(fam, pid)
        medium = e.modality or "Other"
        mid = node(f"medium:{medium}", label=medium, type="medium",
                   detail=f"Contact channel: {medium}.",
                   icon=MEDIUM_ICON.get(medium, MEDIUM_ICON_DEFAULT))
        short = (e.note[:70].rsplit(" ", 1)[0] + "…") if len(e.note) > 70 else e.note
        iid = node(f"int:{client_id}:{i}", label=f"{e.timestamp} · {medium}", type="interaction",
                   date=e.timestamp, medium=medium, contact=e.contact, detail=e.note, summary=short,
                   icon=MEDIUM_ICON.get(medium, MEDIUM_ICON_DEFAULT))
        # An interaction's links carry that interaction's recency; more recent
        # contact reads as warmer/brighter in the canvas. Strength scales with
        # recency so the freshest touchpoints dominate the layout.
        edge_strength = 0.45 + 0.5 * rec
        link(fam, iid, strength=edge_strength, recency=rec)
        link(mid, iid, strength=edge_strength, recency=rec)
        for person in _people(e.contact, family):
            link(f"person:{person}", iid, strength=edge_strength, recency=rec)
        low = e.note.lower()
        for theme, kws in THEMES.items():
            if any(kw in low for kw in kws):
                tid = node(f"theme:{theme}", label=theme, type="theme",
                           detail=f"Cross-client theme: {theme}.",
                           icon=THEME_ICON.get(theme, THEME_ICON_DEFAULT))
                link(iid, tid, strength=edge_strength, recency=rec)

    deg: dict[str, int] = {}
    for l in links:
        deg[l["source"]] = deg.get(l["source"], 0) + 1
        deg[l["target"]] = deg.get(l["target"], 0) + 1
    for n in nodes.values():
        n["color"] = TYPE_COLOR.get(n["type"], "#888")
        n["degree"] = deg.get(n["id"], 0)

    return {"client_id": client_id, "nodes": list(nodes.values()), "links": links}

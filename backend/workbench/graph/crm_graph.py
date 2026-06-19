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


def build_crm_graph(world: World, client_id: str) -> dict:
    meta = world.clients.get(client_id, {})
    family = meta.get("name", client_id).split()[-1]  # surname
    logs = world.meeting_logs.get(client_id, [])

    nodes: dict[str, dict] = {}
    links: list[dict] = []
    seen: set = set()

    def node(nid: str, **attrs) -> str:
        if nid not in nodes:
            nodes[nid] = {"id": nid, **attrs}
        return nid

    def link(a: str, b: str) -> None:
        key = (a, b) if a < b else (b, a)
        if a != b and key not in seen:
            seen.add(key)
            links.append({"source": a, "target": b})

    rm = node("rm:Thomas Keller", label=logs[0].rm_name if logs and logs[0].rm_name else "Relationship Manager",
              type="rm", detail="Relationship manager for the household.")
    fam = node(f"client:{family}", label=f"{meta.get('name', family)}", type="client",
               detail=meta.get("headline", f"{family} household."))
    link(rm, fam)

    for i, e in enumerate(logs, 1):
        for person in _people(e.contact, family):
            pid = node(f"person:{person}", label=person, type="person", detail=f"{family} household member.")
            link(fam, pid)
        medium = e.modality or "Other"
        mid = node(f"medium:{medium}", label=medium, type="medium", detail=f"Contact channel: {medium}.")
        short = (e.note[:70].rsplit(" ", 1)[0] + "…") if len(e.note) > 70 else e.note
        iid = node(f"int:{client_id}:{i}", label=f"{e.timestamp} · {medium}", type="interaction",
                   date=e.timestamp, medium=medium, contact=e.contact, detail=e.note, summary=short)
        link(fam, iid)
        link(mid, iid)
        for person in _people(e.contact, family):
            link(f"person:{person}", iid)
        low = e.note.lower()
        for theme, kws in THEMES.items():
            if any(kw in low for kw in kws):
                tid = node(f"theme:{theme}", label=theme, type="theme", detail=f"Cross-client theme: {theme}.")
                link(iid, tid)

    deg: dict[str, int] = {}
    for l in links:
        deg[l["source"]] = deg.get(l["source"], 0) + 1
        deg[l["target"]] = deg.get(l["target"], 0) + 1
    for n in nodes.values():
        n["color"] = TYPE_COLOR.get(n["type"], "#888")
        n["degree"] = deg.get(n["id"], 0)

    return {"client_id": client_id, "nodes": list(nodes.values()), "links": links}

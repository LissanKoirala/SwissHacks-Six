"""Resolve a Yahoo/FMP logo ticker for any held position — equity, bond, or duplicate line."""
from __future__ import annotations

import re

from .graph.store import World
from .models import Holding

# Issuer labels that never carry a corporate logo (sovereigns, cash, generic ETFs).
_NO_LOGO_ROOTS = frozenset({
    "swiss confederation", "us treasury", "germany bund", "france oat",
    "united mexican states", "federative republic of brazil",
    "republic of indonesia", "republic of south africa",
    "kingdom of saudi arabia", "kanton zürich", "eurofima", "pfandbriefbank",
    "usd cash account", "ubs (ch) property fund", "ubs (ch) real estate fund interswiss",
})

# Bond / duplicate lines whose issuer string does not exactly match an equity row.
_STATIC_ISSUER: dict[str, str] = {
    "Coca-Cola Co.": "KO",
    "The Coca-Cola Co.": "KO",
    "Johnson & Johnson": "JNJ",
    "Walmart Inc.": "WMT",
    "Sanofi S.A.": "SAN.PA",
    "Siemens Fin.": "SIE.DE",
    "Siemens AG": "SIE.DE",
    "Nestlé S.A.": "NESN.SW",
    "Swisscom AG": "SCMN.SW",
    "Microsoft Corp.": "MSFT",
    "Apple Inc.": "AAPL",
    "Deutsche Telekom": "DTE.DE",
    "BASF SE": "BAS.DE",
    "Prologis Inc.": "PLD",
    "Equinix Inc.": "EQIX",
    "Digital Realty Trust": "DLR",
    "Samsung Electronics": "005930.KS",
    "Reliance Industries": "RELIANCE.NS",
}

_STATIC_ISIN: dict[str, str] = {
    "US191216DP21": "KO",
    "US478160CL64": "JNJ",
    "US931142EE96": "WMT",
    "FR0013409844": "SAN.PA",
    "XS2118273601": "SIE.DE",
    "CH1194355116": "NESN.SW",
    "CH1112455766": "SCMN.SW",
    "US037833CX61": "AAPL",
    "XS1001749289": "MSFT",
    "CH0014420878": "UBSG.SW",
    "LU0196152788": "PGHN.SW",
    "DE000A2TSDE2": "DTE.DE",
    "XS2595418679": "BAS.DE",
    "US74340W1036": "PLD",
    "US29444U7000": "EQIX",
    "US2538681030": "DLR",
    "US7960502018": "005930.KS",
    "US7594701077": "RELIANCE.NS",
}


def issuer_root(name: str) -> str:
    n = (name or "").lower().strip()
    if n.startswith("the "):
        n = n[4:]
    n = n.split("(")[0].strip()
    n = re.sub(
        r"\b(fin\.?|co\.?|corp\.?|inc\.?|plc|ag|sa|se|ltd\.?|n\.v\.?|a/s|etf)\b",
        "",
        n,
    )
    return re.sub(r"\s+", " ", n).strip(" .")


def resolve_logo_ticker(world: World, client_id: str, holding: Holding) -> str | None:
    """Best ticker for logo lookup; None when no corporate mark exists."""
    if (holding.isin or "").lower().startswith("cash-"):
        return None
    if holding.yahoo:
        return holding.yahoo.strip()

    root = issuer_root(holding.issuer)
    if root in _NO_LOGO_ROOTS:
        return None

    if holding.isin and holding.isin in _STATIC_ISIN:
        return _STATIC_ISIN[holding.isin]
    if holding.issuer in _STATIC_ISSUER:
        return _STATIC_ISSUER[holding.issuer]

    for other in world.holdings_for_client(client_id):
        if not other.yahoo:
            continue
        if other.issuer == holding.issuer or issuer_root(other.issuer) == root:
            return other.yahoo.strip()

    return None

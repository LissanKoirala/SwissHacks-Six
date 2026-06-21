"""Geo-resolver for the Investment Map globe (CLAUDE.md §4, PORT_CONTRACT §4).

`resolve_geo(issuer, region, isin)` maps a holding/news issuer to a finite
(lat, lng, country, city). It is deterministic: a curated head-office table for
prominent issuers, otherwise a region anchor with a small name-hash jitter so
co-located names fan out instead of stacking on one pixel.

Pure data + arithmetic — no I/O, no LLM. Always returns finite floats."""
from __future__ import annotations

import hashlib
import unicodedata

# --- curated head offices for prominent issuers -----------------------------
# Keys are matched case-insensitively against a normalised issuer string
# (see _norm). Value: (lat, lng, country, city).
ISSUER_HQ: dict[str, tuple[float, float, str, str]] = {
    # Switzerland
    "nestle": (46.4628, 6.8419, "Switzerland", "Vevey"),
    "roche": (47.5596, 7.6010, "Switzerland", "Basel"),
    "novartis": (47.5596, 7.5886, "Switzerland", "Basel"),
    "ubs": (47.3717, 8.5400, "Switzerland", "Zürich"),
    "zurich insurance": (47.3920, 8.5150, "Switzerland", "Zürich"),
    "partners group": (47.1700, 8.5150, "Switzerland", "Zug"),
    "abb": (47.3920, 8.5150, "Switzerland", "Zürich"),
    "givaudan": (46.2330, 6.0590, "Switzerland", "Vernier"),
    "geberit": (47.2270, 8.7570, "Switzerland", "Rapperswil-Jona"),
    "holcim": (47.3667, 8.5500, "Switzerland", "Zug"),
    "logitech": (46.5170, 6.5630, "Switzerland", "Lausanne"),
    "lonza": (46.1010, 7.8770, "Switzerland", "Visp"),
    "chocoladefabriken lindt": (47.2900, 8.5670, "Switzerland", "Kilchberg"),
    "lindt": (47.2900, 8.5670, "Switzerland", "Kilchberg"),
    "swiss re": (47.3650, 8.5450, "Switzerland", "Zürich"),
    "credit suisse": (47.3700, 8.5390, "Switzerland", "Zürich"),
    "bkw": (46.9480, 7.4474, "Switzerland", "Bern"),
    # Europe
    "asml": (51.4090, 5.4540, "Netherlands", "Veldhoven"),
    "adyen": (52.3700, 4.8900, "Netherlands", "Amsterdam"),
    "lvmh": (48.8530, 2.3490, "France", "Paris"),
    "hermes": (48.8700, 2.3270, "France", "Paris"),
    "hermès": (48.8700, 2.3270, "France", "Paris"),
    "l'oreal": (48.9000, 2.2580, "France", "Clichy"),
    "loreal": (48.9000, 2.2580, "France", "Clichy"),
    "sanofi": (48.8570, 2.2980, "France", "Paris"),
    "france oat": (48.8566, 2.3522, "France", "Paris"),
    "adidas": (49.5710, 10.8870, "Germany", "Herzogenaurach"),
    "siemens": (48.1450, 11.5780, "Germany", "Munich"),
    "allianz": (48.1400, 11.5610, "Germany", "Munich"),
    "muenchener rueckvers": (48.1610, 11.5910, "Germany", "Munich"),
    "basf": (49.4880, 8.4380, "Germany", "Ludwigshafen"),
    "deutsche telekom": (50.7050, 7.1500, "Germany", "Bonn"),
    "germany bund": (52.5200, 13.4050, "Germany", "Berlin"),
    "novo nordisk": (55.7330, 12.4660, "Denmark", "Bagsværd"),
    "astrazeneca": (52.1750, 0.1400, "United Kingdom", "Cambridge"),
    "unilever": (51.4540, -2.5910, "United Kingdom", "London"),
    "iberdrola": (43.2630, -2.9350, "Spain", "Bilbao"),
    "ferrari": (44.5320, 10.8640, "Italy", "Maranello"),
    "linde": (51.4900, -0.2200, "United Kingdom", "Guildford"),
    "eurofima": (46.2044, 6.1432, "Switzerland", "Basel"),
    # United States — tech / pharma / consumer
    "nvidia": (37.3700, -121.9650, "United States", "Santa Clara"),
    "apple": (37.3349, -122.0090, "United States", "Cupertino"),
    "alphabet": (37.4220, -122.0840, "United States", "Mountain View"),
    "google": (37.4220, -122.0840, "United States", "Mountain View"),
    "meta platforms": (37.4850, -122.1480, "United States", "Menlo Park"),
    "microsoft": (47.6400, -122.1300, "United States", "Redmond"),
    "amazon": (47.6220, -122.3370, "United States", "Seattle"),
    "broadcom": (37.3700, -121.9650, "United States", "Palo Alto"),
    "intel": (37.3880, -121.9640, "United States", "Santa Clara"),
    "applied materials": (37.3940, -121.9550, "United States", "Santa Clara"),
    "qualcomm": (32.8950, -117.1960, "United States", "San Diego"),
    "arista networks": (37.4080, -122.0290, "United States", "Santa Clara"),
    "adobe": (37.3300, -121.8930, "United States", "San Jose"),
    "intuit": (37.4170, -122.0980, "United States", "Mountain View"),
    "palo alto networks": (37.3870, -122.0570, "United States", "Santa Clara"),
    "crowdstrike": (30.2670, -97.7430, "United States", "Austin"),
    "datadog": (40.7410, -74.0030, "United States", "New York"),
    "palantir": (38.8920, -104.7910, "United States", "Denver"),
    "netflix": (37.2630, -121.9660, "United States", "Los Gatos"),
    "booking holdings": (41.0670, -73.5410, "United States", "Norwalk"),
    "digital realty": (37.7900, -122.4000, "United States", "San Francisco"),
    "equinix": (37.4880, -122.2280, "United States", "Redwood City"),
    "prologis": (37.7900, -122.4000, "United States", "San Francisco"),
    "entegris": (42.5050, -71.4920, "United States", "Billerica"),
    "eli lilly": (39.7770, -86.1760, "United States", "Indianapolis"),
    "biogen": (42.3950, -71.1410, "United States", "Cambridge"),
    "abbott laboratories": (42.3170, -87.8460, "United States", "Abbott Park"),
    "medtronic": (44.9870, -93.3970, "United States", "Minneapolis"),
    "johnson & johnson": (40.4960, -74.4500, "United States", "New Brunswick"),
    "pfizer": (40.7560, -73.9710, "United States", "New York"),
    "exxon mobil": (33.0380, -96.7290, "United States", "Irving"),
    "jpmorgan chase": (40.7550, -73.9760, "United States", "New York"),
    "bank of america": (35.2270, -80.8430, "United States", "Charlotte"),
    "mastercard": (41.0240, -73.7140, "United States", "Purchase"),
    "berkshire hathaway": (41.2620, -95.9340, "United States", "Omaha"),
    "procter & gamble": (39.1070, -84.5120, "United States", "Cincinnati"),
    "pepsico": (41.0260, -73.7090, "United States", "Purchase"),
    "coca-cola": (33.7700, -84.3960, "United States", "Atlanta"),
    "colgate-palmolive": (40.7560, -73.9760, "United States", "New York"),
    "costco wholesale": (47.7780, -122.2050, "United States", "Issaquah"),
    "home depot": (33.7730, -84.4640, "United States", "Atlanta"),
    "nextera energy": (26.6960, -80.0470, "United States", "Juno Beach"),
    "albemarle": (35.2270, -80.8430, "United States", "Charlotte"),
    # Asia / Emerging
    "tsmc": (24.7740, 121.0030, "Taiwan", "Hsinchu"),
    "taiwan semiconductor": (24.7740, 121.0030, "Taiwan", "Hsinchu"),
    "samsung": (37.2570, 127.0530, "South Korea", "Suwon"),
    "infosys": (12.8460, 77.6630, "India", "Bangalore"),
    "reliance industries": (19.0540, 72.8400, "India", "Mumbai"),
    "china mobile": (22.2800, 114.1580, "Hong Kong", "Hong Kong"),
    "industrial & comm bank": (39.9080, 116.4030, "China", "Beijing"),
    "pdd holdings": (31.2210, 121.5430, "China", "Shanghai"),
    "mercadolibre": (-34.6040, -58.3960, "Argentina", "Buenos Aires"),
    "zkb": (47.3700, 8.5400, "Switzerland", "Zürich"),
    "ishares": (53.3498, -6.2603, "Ireland", "Dublin"),
    "21shares": (47.3700, 8.5400, "Switzerland", "Zürich"),
}

# Sovereign / supranational issuers (workbook bond names).
SOVEREIGN_HQ: dict[str, tuple[float, float, str, str]] = {
    "swiss confederation": (46.9480, 7.4474, "Switzerland", "Bern"),
    "us treasury": (38.9072, -77.0369, "United States", "Washington"),
    "united mexican states": (19.4326, -99.1332, "Mexico", "Mexico City"),
    "federative republic of brazil": (-15.7939, -47.8828, "Brazil", "Brasília"),
    "republic of indonesia": (-6.2088, 106.8456, "Indonesia", "Jakarta"),
    "republic of south africa": (-25.7479, 28.2293, "South Africa", "Pretoria"),
    "kingdom of saudi arabia": (24.7136, 46.6753, "Saudi Arabia", "Riyadh"),
    "kanton zurich": (47.3769, 8.5417, "Switzerland", "Zürich"),
    "kanton zürich": (47.3769, 8.5417, "Switzerland", "Zürich"),
    "pfandbriefbank": (47.3769, 8.5417, "Switzerland", "Zürich"),
    "eurofima": (47.5596, 7.5886, "Switzerland", "Basel"),
}

# --- region anchors (workbook region labels) --------------------------------
REGION_ANCHOR: dict[str, tuple[float, float, str]] = {
    "USA": (39.0, -98.0, "United States"),
    "United States": (39.0, -98.0, "United States"),
    "Schweiz": (47.37, 8.54, "Switzerland"),
    "Switzerland": (47.37, 8.54, "Switzerland"),
    "Europa": (50.0, 9.0, "Europe"),
    "Europe": (50.0, 9.0, "Europe"),
    "Ireland": (53.35, -6.26, "Ireland"),
    "Luxembourg": (49.61, 6.13, "Luxembourg"),
    "Emerging M.": (10.0, 95.0, "Emerging markets"),
    "Emerging Markets": (10.0, 95.0, "Emerging markets"),
    "Global": (47.37, 8.54, "Switzerland"),
}
# Unknown region → central Europe, not the Gulf of Guinea.
_FALLBACK_ANCHOR = (50.0, 9.0, "Europe")
# ISIN prefix → workbook region when the row says "Global".
_ISIN_REGION: dict[str, str] = {
    "CH": "Schweiz",
    "IE": "Ireland",
    "LU": "Luxembourg",
    "US": "USA",
}
_JITTER_DEG = 2.5  # ±2.5° deterministic scatter around an anchor


def _norm(s: str | None) -> str:
    """Lower-cased, ASCII-folded issuer key (ä→a, é→e, ü→u) so curated lookups
    match the workbook's accented names (Nestlé, L'Oréal, Société…)."""
    folded = unicodedata.normalize("NFKD", (s or ""))
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    return folded.strip().lower()


def _hash_unit(seed: str) -> float:
    """Deterministic float in [0, 1) from an arbitrary string."""
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) / 0xFFFFFFFF


def _jitter(seed: str, salt: str) -> float:
    """Symmetric jitter in [-_JITTER_DEG, +_JITTER_DEG], deterministic per seed."""
    return (_hash_unit(seed + "|" + salt) * 2.0 - 1.0) * _JITTER_DEG


def _finite(v: float, fallback: float) -> float:
    return v if isinstance(v, (int, float)) and v == v and abs(v) != float("inf") else fallback


def _hq_lookup(issuer: str) -> tuple[float, float, str, str] | None:
    """Match against curated HQ table: exact, then substring containment."""
    n = _norm(issuer)
    if not n:
        return None
    if n in ISSUER_HQ:
        return ISSUER_HQ[n]
    for key, coords in ISSUER_HQ.items():
        if key in n:
            return coords
    return None


def _sovereign_lookup(issuer: str) -> tuple[float, float, str, str] | None:
    n = _norm(issuer)
    if not n:
        return None
    for key, coords in SOVEREIGN_HQ.items():
        if key in n:
            return coords
    return None


def _region_for(issuer: str, region: str | None, isin: str | None) -> str:
    """Pick the best workbook region label before anchor+jitter."""
    label = (region or "").strip()
    if label and label != "Global":
        return label
    prefix = (isin or "")[:2].upper()
    if prefix in _ISIN_REGION:
        return _ISIN_REGION[prefix]
    n = _norm(issuer)
    if "zkb" in n or "21shares" in n:
        return "Schweiz"
    return label or "Global"


def resolve_geo(
    issuer: str, region: str | None, isin: str | None
) -> tuple[float, float, str, str]:
    """Resolve an issuer to (lat, lng, country, city). Always finite.

    1. Curated head office for prominent issuers (exact city, no jitter).
    2. Sovereign / supranational names (exact city, no jitter).
    3. Otherwise the region anchor + deterministic name-hash jitter (±2.5°).
    """
    hq = _hq_lookup(issuer)
    if hq is not None:
        lat, lng, country, city = hq
        return (_finite(lat, 0.0), _finite(lng, 0.0), country, city)

    sovereign = _sovereign_lookup(issuer)
    if sovereign is not None:
        lat, lng, country, city = sovereign
        return (_finite(lat, 0.0), _finite(lng, 0.0), country, city)

    region_label = _region_for(issuer, region, isin)
    anchor_lat, anchor_lng, country = REGION_ANCHOR.get(
        region_label, _FALLBACK_ANCHOR
    )
    seed = f"{_norm(issuer)}|{isin or ''}"
    lat = anchor_lat + _jitter(seed, "lat")
    lng = anchor_lng + _jitter(seed, "lng")
    # Clamp to valid globe coordinates.
    lat = max(-85.0, min(85.0, _finite(lat, anchor_lat)))
    lng = max(-180.0, min(180.0, _finite(lng, anchor_lng)))
    city = (issuer or "").strip() or country
    return (lat, lng, country, city)

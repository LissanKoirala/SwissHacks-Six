"""City-specific activity suggestions for the Rendezvous planner.

When the RM selects a candidate meeting city, surface venues and experiences matched to
the client's cited interests — not a static Zürich-only list. Each entry is tagged with
interest ids that mirror ``rendezvous.py`` persona chips.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

RendezvousKind = Literal[
    "dining", "sport", "culture", "outdoor", "family",
    "philanthropy", "wine", "travel", "other",
]


class CityActivity(BaseModel):
    id: str
    kind: RendezvousKind
    icon: str
    title: str
    venue: str
    when: str
    why: str
    matched_interest_ids: list[str] = Field(default_factory=list)
    prep: list[str] = Field(default_factory=list)
    score: float = 0.0
    image_url: Optional[str] = None
    url: Optional[str] = None


def _maps_search_url(query: str) -> str:
    from urllib.parse import quote_plus

    return f"https://www.google.com/maps/search/?api=1&query={quote_plus(query)}"


# (iata) -> list of activity templates
# tags = interest ids from rendezvous personas
_CATALOG: dict[str, list[dict]] = {
    "ZRH": [
        {"id": "zrh-uetli", "kind": "outdoor", "icon": "🥾", "title": "Walk up the Uetliberg",
         "venue": "Uetliberg summit trail", "when": "Saturday morning",
         "why": "Forest paths and open views — ideal for conservation-minded clients who prefer the field to a boardroom.",
         "tags": ["reforestation", "nature", "conservation"], "prep": ["Take the wooded ascent", "Pack light rain gear"]},
        {"id": "zrh-hiltl", "kind": "dining", "icon": "🥗", "title": "Lunch at Haus Hiltl",
         "venue": "Haus Hiltl", "when": "Weekday 12:30",
         "why": "The world's oldest vegetarian restaurant — organic and values-aligned.",
         "tags": ["organic", "nature"], "prep": ["Book ahead — it fills up"]},
        {"id": "zrh-kronen", "kind": "dining", "icon": "🍽️", "title": "Lunch at the Kronenhalle",
         "venue": "Kronenhalle", "when": "Weekday 12:30",
         "why": "Old-world Zürich institution — discreet, dependable, classical.",
         "tags": ["traditional", "dividends", "family"], "prep": ["Reserve the corner banquette"]},
        {"id": "zrh-tonhalle", "kind": "culture", "icon": "🎻", "title": "Evening at the Tonhalle",
         "venue": "Tonhalle Zürich", "when": "Friday 19:30",
         "why": "Measured classical programme — quiet and predictable, not flashy.",
         "tags": ["classical", "traditional"], "prep": ["Quiet box, not the stalls"]},
        {"id": "zrh-dolder", "kind": "dining", "icon": "🍽️", "title": "Michelin dinner · Dolder Grand",
         "venue": "The Restaurant, Dolder Grand", "when": "Evening 19:30",
         "why": "Two Michelin stars — matches clients who dine at Baur au Lac standards.",
         "tags": ["fine_dining", "discretion", "governance"], "prep": ["Confirm dietary preferences"]},
        {"id": "zrh-kunst", "kind": "culture", "icon": "🖼️", "title": "Private Kunsthaus viewing",
         "venue": "Kunsthaus Zürich", "when": "Late afternoon",
         "why": "Curator-led tour for art-minded families — understated philanthropy register.",
         "tags": ["art", "family", "research"], "prep": ["Invite spouse explicitly"]},
    ],
    "AMS": [
        {"id": "ams-vondel", "kind": "outdoor", "icon": "🌳", "title": "Morning in Vondelpark",
         "venue": "Vondelpark", "when": "Saturday 10:00",
         "why": "Green heart of Amsterdam — easy walking conversation for ESG-led clients.",
         "tags": ["reforestation", "nature", "organic"], "prep": ["Rent bikes if the client is energetic"]},
        {"id": "ams-rijks", "kind": "culture", "icon": "🖼️", "title": "Rijksmuseum private tour",
         "venue": "Rijksmuseum", "when": "Weekday afternoon",
         "why": "Old masters in a calm setting — art philanthropy without ostentation.",
         "tags": ["art", "classical", "family"], "prep": ["Book the before-hours slot"]},
        {"id": "ams-dekas", "kind": "dining", "icon": "🥗", "title": "Seasonal tasting · De Kas",
         "venue": "De Kas", "when": "Lunch",
         "why": "Greenhouse restaurant on organic produce — measurable sustainability on the plate.",
         "tags": ["organic", "nature", "conservation"], "prep": ["Menu is set — confirm allergies"]},
        {"id": "ams-gracht", "kind": "culture", "icon": "🚤", "title": "Canal walk & coffee",
         "venue": "Herengracht", "when": "Afternoon",
         "why": "Neutral, beautiful backdrop for a cross-border relationship catch-up.",
         "tags": ["traditional", "family", "research"], "prep": ["Pick a quiet café off the main strip"]},
    ],
    "FCO": [
        {"id": "fco-borghese", "kind": "culture", "icon": "🖼️", "title": "Borghese Gallery visit",
         "venue": "Galleria Borghese", "when": "Morning slot",
         "why": "Classical art in villa gardens — culture without a boardroom.",
         "tags": ["art", "classical", "family"], "prep": ["Tickets are timed — book the 9:00 slot"]},
        {"id": "fco-appia", "kind": "outdoor", "icon": "🌳", "title": "Appia Antica park walk",
         "venue": "Parco Regionale Appia Antica", "when": "Early morning",
         "why": "Ancient aqueducts and Mediterranean scrub — biodiversity on foot.",
         "tags": ["reforestation", "nature", "conservation"], "prep": ["Bring water; shade is limited"]},
        {"id": "fco-imago", "kind": "dining", "icon": "🥗", "title": "Farm-to-table lunch · Imago",
         "venue": "Imago (Hassler Roma)", "when": "Lunch",
         "why": "Michelin-starred with a rooftop view — fine dining with Roman restraint.",
         "tags": ["fine_dining", "organic", "governance"], "prep": ["Request terrace if weather allows"]},
        {"id": "fco-vatican", "kind": "philanthropy", "icon": "📚", "title": "Vatican Museums · education wing",
         "venue": "Vatican Museums", "when": "Afternoon",
         "why": "Patronage and cultural stewardship — ties to foundation-minded clients.",
         "tags": ["education", "research", "art"], "prep": ["Skip-the-line passes essential"]},
    ],
    "LHR": [
        {"id": "lhr-kew", "kind": "outdoor", "icon": "🌿", "title": "Kew Gardens tour",
         "venue": "Royal Botanic Gardens, Kew", "when": "Morning",
         "why": "Living catalogue of global plant diversity — speaks to conservation investors.",
         "tags": ["reforestation", "nature", "education"], "prep": ["Book the Treetop Walkway slot"]},
        {"id": "lhr-savoy", "kind": "dining", "icon": "🍽️", "title": "Afternoon tea · The Savoy",
         "venue": "The Savoy", "when": "15:00",
         "why": "Discreet British institution — relationship depth without portfolio noise.",
         "tags": ["traditional", "fine_dining", "discretion"], "prep": ["Dress code: smart"]},
        {"id": "lhr-tate", "kind": "culture", "icon": "🖼️", "title": "Tate Modern private view",
         "venue": "Tate Modern", "when": "Late afternoon",
         "why": "Contemporary art sponsorship register — good for Schneider / Ammann profiles.",
         "tags": ["art", "governance", "family"], "prep": ["Curator intro if available"]},
        {"id": "lhr-emirates", "kind": "sport", "icon": "⚽", "title": "Stadium hospitality preview",
         "venue": "Emirates Stadium tour", "when": "Matchday morning",
         "why": "Premium sport hospitality — Ammann's football interest without the crowd yet.",
         "tags": ["football", "retail", "discretion"], "prep": ["Keep guest list tight"]},
    ],
    "GVA": [
        {"id": "gva-cern", "kind": "culture", "icon": "⚙️", "title": "CERN visitor centre",
         "venue": "CERN Science Gateway", "when": "Morning",
         "why": "Tangible hardware and engineering — Räber's register for physical machinery.",
         "tags": ["hardware", "engineering", "education"], "prep": ["Book the guided tour"]},
        {"id": "gva-lake", "kind": "outdoor", "icon": "🚤", "title": "Lake Geneva promenade walk",
         "venue": "Quai du Mont-Blanc", "when": "Afternoon",
         "why": "Neutral Swiss setting when RM and client are both in-region.",
         "tags": ["traditional", "family", "mountains"], "prep": ["Coffee stop at a lakeside hotel"]},
        {"id": "gva-phil", "kind": "dining", "icon": "🍷", "title": "Dinner · Le Philanthrope",
         "venue": "Le Philanthrope", "when": "Evening",
         "why": "Intimate Geneva dining — governance conversations in a private room.",
         "tags": ["fine_dining", "governance", "discretion"], "prep": ["Request the salon"]},
        {"id": "gva-un", "kind": "philanthropy", "icon": "🌍", "title": "UN Palace grounds tour",
         "venue": "Palais des Nations", "when": "Morning",
         "why": "Multilateral diplomacy backdrop — foundation and governance themes.",
         "tags": ["research", "education", "conservation"], "prep": ["Bring passports for entry"]},
    ],
    "CDG": [
        {"id": "cdg-louvre", "kind": "culture", "icon": "🖼️", "title": "Louvre · early access",
         "venue": "Musée du Louvre", "when": "08:00 slot",
         "why": "Art patronage at scale — quiet corners before the crowds.",
         "tags": ["art", "family", "gala"], "prep": ["Book the Richelieu wing guide"]},
        {"id": "cdg-bois", "kind": "outdoor", "icon": "🌳", "title": "Bois de Boulogne walk",
         "venue": "Bois de Boulogne", "when": "Morning",
         "why": "Paris green space — outdoor ESG conversation without leaving the hub.",
         "tags": ["reforestation", "nature"], "prep": ["Stick to the Allée de Longchamp loop"]},
        {"id": "cdg-plaza", "kind": "dining", "icon": "🍽️", "title": "Lunch · Plaza Athénée",
         "venue": "Plaza Athénée", "when": "12:30",
         "why": "Flagship French fine dining — first-class client expectations.",
         "tags": ["fine_dining", "governance", "discretion"], "prep": ["Jacket required"]},
    ],
    "FRA": [
        {"id": "fra-palm", "kind": "outdoor", "icon": "🌴", "title": "Palmengarten botanical tour",
         "venue": "Palmengarten Frankfurt", "when": "Afternoon",
         "why": "Tropical glasshouses echo rainforest restoration field work.",
         "tags": ["reforestation", "education", "conservation"], "prep": ["Connect to their field projects in the briefing"]},
        {"id": "fra-stadel", "kind": "culture", "icon": "🖼️", "title": "Städel Museum visit",
         "venue": "Städel Museum", "when": "Late afternoon",
         "why": "Old masters to modern — classical tastes in a manageable half-day.",
         "tags": ["classical", "art", "traditional"], "prep": ["Under two hours — he values brevity"]},
        {"id": "fra-main", "kind": "dining", "icon": "🍷", "title": "Main Tower restaurant",
         "venue": "Main Tower Restaurant & Lounge", "when": "Evening",
         "why": "Skyline views with discretion — good for cross-border Schneider / Huber meets.",
         "tags": ["fine_dining", "family", "research"], "prep": ["Window table if available"]},
    ],
    "MUC": [
        {"id": "muc-english", "kind": "outdoor", "icon": "🌳", "title": "English Garden stroll",
         "venue": "Englischer Garten", "when": "Morning",
         "why": "Central European green lung — low-key outdoor rapport building.",
         "tags": ["nature", "organic", "traditional"], "prep": ["Stop at the Chinese Tower beer garden only if client is relaxed"]},
        {"id": "muc-pinhak", "kind": "dining", "icon": "🍽️", "title": "Tasting menu · Tantris",
         "venue": "Tantris", "when": "Evening",
         "why": "Munich's benchmark fine dining — matches premium client expectations.",
         "tags": ["fine_dining", "governance"], "prep": ["Wine pairing optional — ask first"]},
        {"id": "muc-deutsches", "kind": "culture", "icon": "⚙️", "title": "Deutsches Museum tour",
         "venue": "Deutsches Museum", "when": "Morning",
         "why": "Engineering heritage — hardware-minded clients engage quickly here.",
         "tags": ["hardware", "engineering"], "prep": ["Focus on the energy / transport halls"]},
    ],
    "LIS": [
        {"id": "lis-monsanto", "kind": "outdoor", "icon": "🌳", "title": "Monsanto forest park",
         "venue": "Parque Florestal de Monsanto", "when": "Morning",
         "why": "Largest urban forest in Europe — reforestation narrative on home turf.",
         "tags": ["reforestation", "nature", "conservation"], "prep": ["Easy trails only"]},
        {"id": "lis-belcanto", "kind": "dining", "icon": "🍽️", "title": "Dinner · Belcanto",
         "venue": "Belcanto", "when": "Evening",
         "why": "Two Michelin stars in Chiado — discreet luxury for Atlantic mid-point meets.",
         "tags": ["fine_dining", "art", "family"], "prep": ["Book the chef's table if group ≤ 4"]},
    ],
    "MAD": [
        {"id": "mad-retiro", "kind": "outdoor", "icon": "🌳", "title": "Retiro Park walk",
         "venue": "Parque del Retiro", "when": "Morning",
         "why": "Shaded paths and the crystal palace — outdoor without leaving the capital.",
         "tags": ["nature", "reforestation"], "prep": ["Visit the Rosaleda if in season"]},
        {"id": "mad-prado", "kind": "culture", "icon": "🖼️", "title": "Prado before hours",
         "venue": "Museo del Prado", "when": "09:00",
         "why": "European masterworks — art-minded foundation clients.",
         "tags": ["art", "classical", "gala"], "prep": ["Focus on Goya / Velázquez room"]},
    ],
    "VIE": [
        {"id": "vie-prater", "kind": "outdoor", "icon": "🌳", "title": "Prater woodland walk",
         "venue": "Wiener Prater", "when": "Morning",
         "why": "Danube-side greenery — neutral central-Europe meet-up.",
         "tags": ["nature", "traditional"], "prep": ["Skip the amusement rides"]},
        {"id": "vie-steir", "kind": "dining", "icon": "🍽️", "title": "Lunch · Steirereck",
         "venue": "Steirereck im Stadtpark", "when": "Lunch",
         "why": "World-ranked seasonal cuisine — understated excellence for Räber-types.",
         "tags": ["traditional", "fine_dining", "dividends"], "prep": ["Reserve weeks ahead"]},
    ],
    "BRU": [
        {"id": "bru-sonian", "kind": "outdoor", "icon": "🌳", "title": "Sonian Forest hike",
         "venue": "Forêt de Soignes", "when": "Morning",
         "why": "Ancient beech forest at Europe's crossroads — biodiversity on the agenda.",
         "tags": ["reforestation", "nature", "conservation"], "prep": ["Beech cathedral trail is 90 min"]},
        {"id": "bru-belvue", "kind": "philanthropy", "icon": "🎗️", "title": "Belvue Museum · democracy",
         "venue": "Belvue Museum", "when": "Afternoon",
         "why": "Governance and institutions — EU capital context for ethical leadership clients.",
         "tags": ["governance", "education", "research"], "prep": ["Pair with a quiet café on Place Royale"]},
    ],
    "BOS": [
        {"id": "bos-harvard", "kind": "philanthropy", "icon": "🔬", "title": "Harvard neuro research tour",
         "venue": "Harvard Medical School campus", "when": "Morning",
         "why": "Schneider's Parkinson's mission — research philanthropy where it happens.",
         "tags": ["research", "gala", "family"], "prep": ["Coordinate with the foundation contact"]},
        {"id": "bos-gardner", "kind": "culture", "icon": "🖼️", "title": "Isabella Stewart Gardner Museum",
         "venue": "Gardner Museum", "when": "Afternoon",
         "why": "Intimate art patronage — Carmen's sponsorship register.",
         "tags": ["art", "family"], "prep": ["Courtyard café for debrief"]},
        {"id": "bos-arnold", "kind": "outdoor", "icon": "🌳", "title": "Arnold Arboretum walk",
         "venue": "Arnold Arboretum", "when": "Morning",
         "why": "Living tree collection — conservation without leaving Boston.",
         "tags": ["reforestation", "nature", "education"], "prep": ["Pick the conifer collection loop"]},
    ],
    "GRU": [
        {"id": "gru-ibirapuera", "kind": "outdoor", "icon": "🌳", "title": "Ibirapuera Park walk",
         "venue": "Parque Ibirapuera", "when": "Early morning",
         "why": "Urban green space before the heat — field-work mindset for Huber.",
         "tags": ["reforestation", "nature", "conservation"], "prep": ["Security-aware — stay in main paths"]},
        {"id": "gru-mata", "kind": "travel", "icon": "🌎", "title": "Mata Atlântica briefing",
         "venue": "Instituto Terra office", "when": "Afternoon",
         "why": "On-the-ground Atlantic Forest restoration — their live project context.",
         "tags": ["conservation", "education", "reforestation"], "prep": ["Bring the latest impact metrics"]},
    ],
    "DXB": [
        {"id": "dxb-miracle", "kind": "outdoor", "icon": "🌳", "title": "Miracle Garden visit",
         "venue": "Dubai Miracle Garden", "when": "Morning",
         "why": "Improbable urban greening — conversation starter on engineered ecosystems.",
         "tags": ["nature", "education"], "prep": ["Seasonal — confirm open dates"]},
        {"id": "dxb-atmos", "kind": "dining", "icon": "🍽️", "title": "Lunch · At.mosphere",
         "venue": "Burj Khalifa · At.mosphere", "when": "Lunch",
         "why": "Premium hospitality for clients who expect top-tier service.",
         "tags": ["fine_dining", "discretion", "governance"], "prep": ["Dress code strictly enforced"]},
    ],
    "JFK": [
        {"id": "jfk-highline", "kind": "outdoor", "icon": "🌿", "title": "High Line walk",
         "venue": "The High Line", "when": "Morning",
         "why": "Reclaimed urban greenway — ESG narrative in Manhattan.",
         "tags": ["reforestation", "nature", "conservation"], "prep": ["Start at Hudson Yards, walk south"]},
        {"id": "jfk-met", "kind": "culture", "icon": "🖼️", "title": "Met Museum · private tour",
         "venue": "The Met", "when": "Afternoon",
         "why": "World-class art — foundation and patronage themes.",
         "tags": ["art", "gala", "family"], "prep": ["Member early access if available"]},
    ],
}


def _fallback_activities(city: str, iata: str) -> list[dict]:
    return [
        {"id": f"{iata.lower()}-walk", "kind": "outdoor", "icon": "🚶", "title": f"City-centre walk · {city}",
         "venue": f"{city} old town", "when": "Morning",
         "why": "Low-friction rapport building in the chosen meet-up city.",
         "tags": ["family", "traditional"], "prep": ["Pick a quiet café for the debrief"]},
        {"id": f"{iata.lower()}-dine", "kind": "dining", "icon": "🍽️", "title": f"Relationship dinner · {city}",
         "venue": f"Leading local restaurant", "when": "Evening",
         "why": "Private table to deepen the relationship away from the office.",
         "tags": ["fine_dining", "discretion"], "prep": ["Confirm dietary preferences"]},
        {"id": f"{iata.lower()}-culture", "kind": "culture", "icon": "🏛️", "title": f"Local museum visit · {city}",
         "venue": f"{city} national museum", "when": "Afternoon",
         "why": "Shared cultural experience — conversation flows more easily side-by-side.",
         "tags": ["art", "classical", "education"], "prep": ["Book timed entry"]},
    ]


def activities_for_city(
    iata: str,
    city: str,
    *,
    interest_ids: list[str],
    limit: int = 4,
) -> list[CityActivity]:
    """Rank city activities by overlap with the client's cited interests."""
    from .wikipedia_media import wikipedia_lookup

    pool = _CATALOG.get(iata) or _fallback_activities(city, iata)
    interest_set = set(interest_ids)
    scored: list[CityActivity] = []
    for item in pool:
        tags = set(item.get("tags") or [])
        overlap = tags & interest_set
        score = len(overlap) * 10 + (2 if overlap else 0)
        venue = item.get("venue") or item["title"]
        img_v, link_v = wikipedia_lookup(venue)
        img_t, link_t = wikipedia_lookup(item["title"])
        if item["title"] != venue and (img_t or link_t):
            img, link = img_t or img_v, link_t or link_v
        else:
            img, link = img_v or img_t, link_v or link_t
        if not link:
            link = _maps_search_url(f"{venue}, {city}")
        scored.append(CityActivity(
            id=item["id"],
            kind=item["kind"],
            icon=item["icon"],
            title=item["title"],
            venue=item["venue"],
            when=item.get("when", "Flexible"),
            why=item["why"],
            matched_interest_ids=sorted(overlap),
            prep=item.get("prep") or [],
            score=float(score),
            image_url=img,
            url=link,
        ))
    scored.sort(key=lambda a: (-a.score, a.title))
    return scored[:limit]

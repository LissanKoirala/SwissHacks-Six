"""Controlled topic vocabulary (CLAUDE.md §7.1).

CRM and News streams both write topic edges and MUST use these exact strings. A match is a
shared topic node — so the vocabulary is the contract that makes set-intersection matching work.
"""
from __future__ import annotations


class Topic:
    name: str
    label: str
    description: str
    keywords: list[str]

    def __init__(self, name: str, label: str, description: str, keywords: list[str]):
        self.name = name
        self.label = label
        self.description = description
        self.keywords = keywords


# Value/interest topics — the personas' documented priorities.
TOPIC_VOCAB: dict[str, Topic] = {
    "esg-deforestation": Topic(
        "esg-deforestation",
        "Deforestation & biodiversity",
        "Palm-oil deforestation, rainforest protection, reforestation and supply-chain ecology.",
        ["palm oil", "palm-oil", "deforestation", "rainforest", "reforestation", "reforest",
         "biodiversity", "amazon", "ecosystem", "ecological", "sustainable agriculture",
         "supply chain ecology", "indigenous land", "conservation",
         # broadened synonyms / paraphrases
         "forest", "forestry", "logging", "land clearing", "habitat", "wildlife",
         "carbon sink", "tree planting", "plant trees", "soy", "cattle ranching",
         "environmental", "sustainability", "green", "nature", "rewilding",
         "supply chain ecolog", "clear-cut", "clearcut", "old-growth"],
    ),
    "neuro-research": Topic(
        "neuro-research",
        "Neurodegenerative research",
        "Parkinson's / neurodegenerative / brain-disease research commitment by pharma holdings.",
        ["parkinson", "parkinson's", "neurodegenerative", "neuroscience", "neurology",
         "brain disease", "movement disorder", "neuro research", "clinical pipeline",
         "neurological",
         # broadened synonyms / paraphrases
         "alzheimer", "alzheimer's", "dementia", "huntington", "motor neurone",
         "motor neuron", "multiple sclerosis", "epilepsy", "brain illness",
         "brain-illness", "brain research", "neuro", "degenerative disease",
         "research division", "research field", "research unit", "clinical trial",
         "drug pipeline", "drug research", "therapeutic", "cure", "medical research",
         "biomedical", "rare disease"],
    ),
    "labour-governance": Topic(
        "labour-governance",
        "Labour & supply-chain governance",
        "Labour exploitation, sweatshops, forced labour, wage theft and supply-chain governance "
        "scandals that create reputational risk.",
        ["labour exploitation", "labor exploitation", "sweatshop", "forced labour",
         "forced labor", "wage theft", "child labour", "child labor", "supply-chain governance",
         "supply chain scandal", "worker exploitation", "labour scandal", "labor scandal",
         "exploitation allegations", "modern slavery",
         # broadened synonyms / paraphrases
         "working conditions", "labour rights", "labor rights", "union", "strike",
         "underpaid", "exploited workers", "exploited", "human rights",
         "ethics scandal", "governance failure", "governance issue", "boycott",
         "supplier audit", "factory conditions", "unethical", "mistreated workers",
         "poor treatment of workers", "slave labour", "slave labor"],
    ),
    "us-tech-ai": Topic(
        "us-tech-ai",
        "US mega-cap tech / AI",
        "US mega-cap technology and AI software — speculative growth the client is averse to.",
        ["artificial intelligence", "ai infrastructure", "ai boom", "mega-cap tech",
         "us tech", "software valuation", "silicon valley", "cloud software", "ai hype",
         "tech bubble", "ai stocks", "ai rally",
         # broadened synonyms / paraphrases
         "nvidia", "openai", "magnificent seven", "mag 7", "chatgpt", "llm models",
         "gpu", "data center", "data centre", "hyperscaler", "tech rally",
         "speculative tech", "frothy tech", "nasdaq", "growth tech", "big tech",
         "us technology", "american tech", "tech giants", "semiconductor"],
    ),
}

# Sector nodes (CLAUDE.md §3: sector nodes live in the meta graph so swaps stay same-sector).
# Keyed by the CIO list / portfolio "Industry Group" string.
SECTORS = [
    "Health Care", "Consumer Staples", "Consumer Discretionary", "Information Technology",
    "Financials", "Industrials", "Materials", "Energy", "Communication Services", "Utilities",
    "Real Estate (REIT)", "Real Estate (Fund)",
]


def classify_text(text: str) -> list[str]:
    """Cheap, deterministic keyword classifier — the 'classify once' worker's offline mode.
    Returns the value topics present in the text. Never calls an LLM."""
    if not text:
        return []
    low = text.lower()
    hits: list[str] = []
    for name, topic in TOPIC_VOCAB.items():
        if any(kw in low for kw in topic.keywords):
            hits.append(name)
    return hits


def topic_label(name: str) -> str:
    t = TOPIC_VOCAB.get(name)
    return t.label if t else name

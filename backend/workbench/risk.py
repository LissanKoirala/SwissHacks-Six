"""Per-name risk estimates for risk-matched substitution (HI1).

The Ammann persona needs a swap "at similar risk" with "substitution metrics". Live SIX
`histVol30d` is the gold source, but it is only available when USE_LIVE=1 *and* the listing is
priced — which the demo (offline by default) is not. So we estimate a name's 30-day historical
volatility and market beta from its **sector**, with a small deterministic per-name spread, and
label the result `risk_source="sector model"`. This keeps the substitution table honest — it never
claims a SIX number it does not have — while still giving the RM a real, comparable risk delta.
When live SIX risk is present it overrides these (risk_source="SIX EOD")."""
from __future__ import annotations

import hashlib
from typing import Optional

# Annualised 30-day historical volatility (decimal) by CIO industry group. Round, defensible
# sector figures — equities mid-teens→high-20s, govvies low, digital assets high.
SECTOR_VOL = {
    "Information Technology": 0.30,
    "Health Care": 0.20,
    "Consumer Staples": 0.14,
    "Consumer Discretionary": 0.26,
    "Financials": 0.24,
    "Industrials": 0.22,
    "Materials": 0.26,
    "Communication Services": 0.24,
    "Utilities": 0.15,
    "Energy": 0.30,
    "Real Estate (REIT)": 0.20,
    "Real Estate (Fund)": 0.16,
    "Telecommunication": 0.18,
    "Diversified ETF": 0.15,
    "Precious Metals": 0.28,
    "Digital Assets": 0.70,
    "Private Markets": 0.12,
    "Government Bonds": 0.05,
    "Investment Grade": 0.07,
}
SECTOR_BETA = {
    "Information Technology": 1.25,
    "Health Care": 0.85,
    "Consumer Staples": 0.60,
    "Consumer Discretionary": 1.15,
    "Financials": 1.20,
    "Industrials": 1.10,
    "Materials": 1.15,
    "Communication Services": 1.05,
    "Utilities": 0.55,
    "Energy": 1.10,
    "Real Estate (REIT)": 0.90,
    "Real Estate (Fund)": 0.70,
    "Telecommunication": 0.80,
    "Diversified ETF": 1.00,
    "Precious Metals": 0.30,
    "Digital Assets": 1.60,
    "Private Markets": 0.80,
    "Government Bonds": 0.00,
    "Investment Grade": 0.10,
}
_DEFAULT_VOL = 0.22
_DEFAULT_BETA = 1.00

MODEL_LABEL = "sector model"


def _spread(seed: str, lo: float, hi: float) -> float:
    """Deterministic per-name spread in [lo, hi] from a stable hash of the ISIN."""
    h = int(hashlib.sha1(seed.encode()).hexdigest()[:8], 16)
    return lo + (hi - lo) * ((h % 1000) / 999.0)


def model_risk(industry_group: Optional[str], isin: str) -> "tuple[float, float]":
    """Modelled (hist_vol_30d, beta) for a name — sector base ± a small deterministic spread so
    same-sector names are similar but not identical."""
    ig = industry_group or ""
    vol = SECTOR_VOL.get(ig, _DEFAULT_VOL) * (1 + _spread(isin + ":v", -0.10, 0.10))
    beta = SECTOR_BETA.get(ig, _DEFAULT_BETA) * (1 + _spread(isin + ":b", -0.08, 0.08))
    return round(vol, 4), round(beta, 3)

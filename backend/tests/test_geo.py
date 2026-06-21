"""Geo resolver for the investment map."""

from workbench.geo import resolve_geo


def test_swiss_isin_global_region_uses_switzerland():
    lat, lng, country, _city = resolve_geo("ZKB Gold ETF", "Global", "CH0047533523")
    assert country == "Switzerland"
    assert 46 < lat < 48
    assert 7 < lng < 10


def test_sovereign_indonesia_not_emerging_anchor():
    lat, lng, country, city = resolve_geo(
        "Republic of Indonesia", "Emerging M.", "XS1508675508"
    )
    assert country == "Indonesia"
    assert city == "Jakarta"
    assert -10 < lat < 0
    assert 100 < lng < 110


def test_unilever_europe_is_uk():
    lat, lng, country, _city = resolve_geo("Unilever PLC", "Europa", "GB00B10RZP78")
    assert country == "United Kingdom"
    assert lat > 50
    assert lng < 0

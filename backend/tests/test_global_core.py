import os

from global_core import configured_fx_rates, convert_amount, shipping_for_shop


def test_fx_defaults_to_bdt_only(monkeypatch):
    monkeypatch.delenv("FX_RATES_JSON", raising=False)
    rates = configured_fx_rates()
    assert rates["BDT"] == 1
    assert "USD" not in rates


def test_fx_conversion_from_config(monkeypatch):
    monkeypatch.setenv("FX_RATES_JSON", '{"BDT":1,"USD":0.01,"EUR":0.008}')
    assert float(convert_amount(1000, "BDT", "USD")) == 10.0
    assert float(convert_amount(10, "USD", "BDT")) == 1000.0


def test_shipping_is_per_shop_and_country(monkeypatch):
    monkeypatch.setenv("DELIVERY_FEE_BDT", "60")
    monkeypatch.setenv("INTERNATIONAL_DELIVERY_FEE_BDT", "1200")
    monkeypatch.setenv("FREE_DELIVERY_OVER_BDT", "0")
    shop = {"name": "Example", "country_code": "BD", "shipping_config": {"ships_international": True}}
    assert shipping_for_shop(shop, {"country_code": "BD"}, 100000) == 6000
    assert shipping_for_shop(shop, {"country_code": "US"}, 100000) == 120000


def test_shipping_respects_country_allowlist(monkeypatch):
    monkeypatch.setenv("FREE_DELIVERY_OVER_BDT", "0")
    shop = {
        "name": "Example",
        "country_code": "BD",
        "shipping_config": {"ships_international": True, "allowed_countries": ["US", "GB"]},
    }
    assert shipping_for_shop(shop, {"country_code": "US"}, 10000) >= 0
    try:
        shipping_for_shop(shop, {"country_code": "AU"}, 10000)
        assert False, "Expected AU to be rejected"
    except ValueError:
        pass

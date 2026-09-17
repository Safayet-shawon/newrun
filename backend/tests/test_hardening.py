from io import BytesIO
from datetime import datetime, timedelta, timezone

import pytest
from PIL import Image
from pydantic import ValidationError

from accounting import order_accounting_snapshot
from entitlements import get_effective_plan_id, get_plan
from order_workflows import COURIER_TRANSITIONS, RETURN_TRANSITIONS, require_transition
from seller import normalize_shop_slug
from storage import validate_image_bytes
from subscription_billing import SubscriptionPaymentBody, subscription_period
from production_ops import (
    CourierConnectionBody,
    _credential_payload,
    _decrypt_json,
    _encrypt_json,
    _safe_provider_status,
)


def image_bytes(image_format="PNG", size=(20, 10)):
    output = BytesIO()
    Image.new("RGB", size, "navy").save(output, format=image_format)
    return output.getvalue()


def test_shop_slug_normalization_and_reserved_names():
    assert normalize_shop_slug("  My Great Shop!! ") == "my-great-shop"
    assert normalize_shop_slug("one---two") == "one-two"
    for value in ("api", "admin-tools", "x", "---"):
        with pytest.raises(ValueError):
            normalize_shop_slug(value)


def test_upload_validation_uses_image_content():
    assert validate_image_bytes(image_bytes(), "photo.png", "image/png") == ("png", "image/png")
    with pytest.raises(ValueError, match="extension"):
        validate_image_bytes(image_bytes(), "photo.jpg", "image/jpeg")
    with pytest.raises(ValueError, match="valid supported image"):
        validate_image_bytes(b"not-an-image", "photo.png", "image/png")


def test_order_accounting_snapshot_is_non_settling_and_plan_based():
    row = order_accounting_snapshot({"subtotal_paisa": 100_00, "delivery_paisa": 60_00}, "grow", {})
    assert row["platform_commission_paisa"] == 500
    assert row["seller_net_paisa"] == 15_500
    assert row["settlement_status"] == "not_settled"


def test_order_workflow_transitions_reject_skips():
    assert require_transition("requested", "approved", RETURN_TRANSITIONS, "Return") == "approved"
    assert require_transition("picked_up", "in_transit", COURIER_TRANSITIONS, "Shipment") == "in_transit"
    with pytest.raises(ValueError):
        require_transition("requested", "refunded", RETURN_TRANSITIONS, "Return")
    with pytest.raises(ValueError):
        require_transition("awaiting_courier_connection", "delivered", COURIER_TRANSITIONS, "Shipment")


def test_subscription_payment_requires_retry_key():
    valid = SubscriptionPaymentBody(plan="grow", idempotency_key="payment-attempt-0001")
    assert valid.plan == "grow"
    with pytest.raises(ValidationError):
        SubscriptionPaymentBody(plan="grow", idempotency_key="short")


def test_subscription_period_policy():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    expiry = now + timedelta(days=10)
    renewal, start, renewed_until = subscription_period({"plan": "grow", "status": "active", "expires_at": expiry.isoformat()}, "grow", now)
    assert renewal == "renewal" and start == expiry and renewed_until == expiry + timedelta(days=30)
    upgrade, start, upgraded_until = subscription_period({"plan": "start", "status": "active", "expires_at": expiry.isoformat()}, "grow", now)
    assert upgrade == "upgrade" and start == now and upgraded_until == now + timedelta(days=30)
    with pytest.raises(ValueError, match="Downgrades"):
        subscription_period({"plan": "pro", "status": "active", "expires_at": expiry.isoformat()}, "start", now)


def test_unknown_plan_fails_safe_to_free():
    assert get_plan("invalid-plan")["id"] == "free"


def test_expired_subscription_has_free_effective_plan():
    now = datetime(2026, 9, 17, tzinfo=timezone.utc)
    subscription = {
        "plan": "pro",
        "status": "active",
        "expires_at": "2026-09-16T00:00:00+00:00",
    }
    assert get_effective_plan_id(subscription, now) == "free"


def test_valid_active_subscription_keeps_plan():
    now = datetime(2026, 9, 17, tzinfo=timezone.utc)
    subscription = {
        "plan": "pro",
        "status": "active",
        "expires_at": "2026-10-17T00:00:00+00:00",
    }
    assert get_effective_plan_id(subscription, now) == "pro"


def test_pending_subscription_has_free_entitlement():
    assert get_effective_plan_id({"plan": "pro", "status": "pending_payment"}) == "free"


def test_courier_credentials_are_encrypted_and_provider_scoped(monkeypatch):
    monkeypatch.setenv("INTEGRATION_ENCRYPTION_SECRET", "test-secret-that-is-long-enough-for-regression")
    secret = {"api_key": "merchant-key", "secret_key": "merchant-secret"}
    encrypted = _encrypt_json(secret)
    assert "merchant-key" not in encrypted and "merchant-secret" not in encrypted
    assert _decrypt_json(encrypted) == secret
    body = CourierConnectionBody(api_key="merchant-key", secret_key="merchant-secret", password="must-not-leak")
    assert _credential_payload("steadfast", body) == secret


def test_courier_status_normalization():
    assert _safe_provider_status("pathao", {"data": {"order_status": "Delivered"}}) == "delivered"
    assert _safe_provider_status("steadfast", {"delivery_status": "in_transit"}) == "in_transit"
    assert _safe_provider_status("redx", {"data": {"parcel_status": "Returned to merchant"}}) == "returned"
    assert _safe_provider_status("redx", {"status": "pickup pending"}) == "pickup_requested"


def test_store_import_has_one_public_scan_gateway():
    from server import app

    paths = app.openapi()["paths"]
    assert list(paths["/api/seller/import-store/scan"]) == ["post"]
    assert list(paths["/api/seller/import-store/manual/start"]) == ["post"]
    assert "/api/seller/import-store/scan/legacy" not in paths
    assert "/api/seller/import-store/scan/browser-legacy" not in paths


def test_production_commerce_routes_are_exposed():
    from server import app

    paths = app.openapi()["paths"]
    assert "post" in paths["/api/seller/integrations/couriers/book/{order_id}"]
    assert "post" in paths["/api/seller/integrations/couriers/track/{order_id}"]
    assert "get" in paths["/api/order-verification/{token}"]
    assert "post" in paths["/api/order-verification/{token}"]
    assert "get" in paths["/api/seller/settlements"]
    assert "post" in paths["/api/seller/growth/connectors/{source_type}/sync"]

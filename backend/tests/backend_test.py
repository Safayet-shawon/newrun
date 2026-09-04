"""NEXORA backend API regression tests (health, catalog, auth, seller, entitlements, commerce, reviews)."""
import os
import re
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"


def _creds():
    content = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
    return content


@pytest.fixture(scope="session")
def creds():
    c = _creds()
    emails = re.findall(r"(?im)^-\s*Email:\s*(\S+)", c)
    pwds = re.findall(r"(?im)^-\s*Password:\s*(\S+)", c)
    if len(emails) < 3 or len(pwds) < 3:
        pytest.skip("credentials file incomplete")
    return {
        "admin": {"email": emails[0], "password": pwds[0]},
        "customer": {"email": emails[1], "password": pwds[1]},
        "seller": {"email": emails[2], "password": pwds[2]},
    }


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(client, email, password):
    r = client.post(f"{API}/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        pytest.fail(f"login failed {email}: {r.status_code} {r.text[:300]}")
    return r.json()


@pytest.fixture(scope="session")
def customer_token(client, creds):
    return _login(client, creds["customer"]["email"], creds["customer"]["password"])["token"]


@pytest.fixture(scope="session")
def seller_token(client, creds):
    return _login(client, creds["seller"]["email"], creds["seller"]["password"])["token"]


def h(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------- Health & Catalog ----------------
class TestHealthCatalog:
    def test_root(self, client):
        r = client.get(f"{API}/")
        assert r.status_code == 200
        assert "online" in r.json()["message"].lower()

    def test_home(self, client):
        r = client.get(f"{API}/home")
        assert r.status_code == 200
        d = r.json()
        for k in ["categories", "trending", "top_rated", "new_arrivals", "deals", "featured_shops", "brands"]:
            assert k in d, f"missing {k}"
            assert isinstance(d[k], list)
        assert len(d["categories"]) == 9
        assert len(d["trending"]) > 0
        assert len(d["featured_shops"]) > 0

    def test_categories(self, client):
        r = client.get(f"{API}/categories")
        assert r.status_code == 200
        cats = r.json()
        assert len(cats) == 9
        assert all("slug" in c and "theme" in c and "product_count" in c for c in cats)
        assert "_id" not in cats[0]

    def test_products_list(self, client):
        r = client.get(f"{API}/products?limit=100")
        assert r.status_code == 200
        d = r.json()
        assert d["total"] >= 90, f"expected ~95 products, got {d['total']}"
        assert len(d["items"]) > 0
        assert all(p["status"] == "published" for p in d["items"])

    def test_products_filters(self, client):
        cat = client.get(f"{API}/categories").json()[0]["slug"]
        r = client.get(f"{API}/products?category={cat}")
        assert r.status_code == 200
        assert all(p["category"] == cat for p in r.json()["items"])
        r2 = client.get(f"{API}/products?search=shirt&sort=price_low")
        assert r2.status_code == 200
        prices = [p["price"] for p in r2.json()["items"]]
        assert prices == sorted(prices)

    def test_product_detail(self, client):
        pid = client.get(f"{API}/products?limit=1").json()["items"][0]["id"]
        r = client.get(f"{API}/products/{pid}")
        assert r.status_code == 200
        d = r.json()
        for k in ["product", "shop", "similar", "frequently_bought", "reviews"]:
            assert k in d
        assert d["product"]["id"] == pid
        assert d["shop"] is not None

    def test_product_detail_404(self, client):
        r = client.get(f"{API}/products/prod_does_not_exist")
        assert r.status_code == 404

    def test_shops(self, client):
        r = client.get(f"{API}/shops")
        assert r.status_code == 200
        shops = r.json()
        assert len(shops) == 13, f"expected 13 shops, got {len(shops)}"
        assert all(s["status"] == "published" for s in shops)

    def test_shop_detail(self, client):
        r = client.get(f"{API}/shops/dhaka-threads")
        assert r.status_code == 200
        d = r.json()
        assert d["shop"]["slug"] == "dhaka-threads"
        assert len(d["products"]) > 0
        assert "featured" in d and "reviews" in d

    def test_shop_404(self, client):
        r = client.get(f"{API}/shops/no-such-shop")
        assert r.status_code == 404

    def test_brands(self, client):
        r = client.get(f"{API}/brands")
        assert r.status_code == 200
        assert len(r.json()) > 0


# ---------------- Auth ----------------
class TestAuth:
    def test_register_customer(self, client):
        email = f"qa_cust_{uuid.uuid4().hex[:8]}@qa-nexora.com"
        r = client.post(f"{API}/auth/register", json={"name": "TEST_User", "email": email, "password": "secret123", "role": "customer"})
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["token"] and isinstance(d["token"], str)
        assert d["user"]["email"] == email
        assert d["user"]["role"] == "customer"
        assert "password_hash" not in d["user"]
        # me works
        me = client.get(f"{API}/auth/me", headers=h(d["token"]))
        assert me.status_code == 200
        assert me.json()["user"]["email"] == email
        # duplicate registration rejected
        dup = client.post(f"{API}/auth/register", json={"name": "x", "email": email, "password": "secret123"})
        assert dup.status_code == 400

    def test_register_seller_creates_profile(self, client):
        email = f"qa_seller_{uuid.uuid4().hex[:8]}@qa-nexora.com"
        r = client.post(f"{API}/auth/register", json={"name": "TEST_Seller", "email": email, "password": "secret123", "role": "seller"})
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["role"] == "seller"
        assert d["seller_setup"] == {"onboarding_complete": False}

    def test_login_customer_role(self, client, creds):
        d = _login(client, creds["customer"]["email"], creds["customer"]["password"])
        assert d["user"]["role"] == "customer"
        assert d["seller_setup"] is None

    def test_login_seller_onboarded(self, client, creds):
        d = _login(client, creds["seller"]["email"], creds["seller"]["password"])
        assert d["user"]["role"] == "seller"
        assert d["seller_setup"]["onboarding_complete"] is True

    def test_login_admin(self, client, creds):
        d = _login(client, creds["admin"]["email"], creds["admin"]["password"])
        assert d["user"]["role"] == "admin"

    def test_login_bad_password(self, client, creds):
        r = client.post(f"{API}/auth/login", json={"email": creds["customer"]["email"], "password": "wrongpass"})
        assert r.status_code == 401

    def test_me_requires_token(self, client):
        r = client.get(f"{API}/auth/me")
        assert r.status_code == 401
        r2 = client.get(f"{API}/auth/me", headers=h("garbage.token.value"))
        assert r2.status_code == 401

    def test_google_endpoint_exists(self, client):
        r = client.post(f"{API}/auth/google", json={"session_id": "invalid-session", "role": "customer"})
        assert r.status_code == 400, f"expected 400 for bad session, got {r.status_code}"


# ---------------- Seller + entitlements ----------------
class TestSeller:
    created = []

    def test_seller_me(self, client, seller_token):
        r = client.get(f"{API}/seller/me", headers=h(seller_token))
        assert r.status_code == 200
        d = r.json()
        for k in ["profile", "shop", "subscription", "plan", "entitlements"]:
            assert k in d
        assert d["shop"]["slug"] == "dhaka-threads"
        assert d["plan"]["id"] == "grow"
        assert d["entitlements"]["theme_switching"] is True
        assert d["entitlements"]["max_products"] == 500

    def test_customer_cannot_access_seller(self, client, customer_token):
        r = client.get(f"{API}/seller/me", headers=h(customer_token))
        assert r.status_code == 403

    def test_seller_products_crud(self, client, seller_token):
        lst = client.get(f"{API}/seller/products", headers=h(seller_token))
        assert lst.status_code == 200
        before = lst.json()["total"]
        assert before > 0

        payload = {"title": "TEST_Product QA", "description": "qa", "price": 1234.0, "stock": 7,
                   "status": "published", "images": ["https://example.com/x.jpg"], "brand": "TEST"}
        c = client.post(f"{API}/seller/products", headers=h(seller_token), json=payload)
        assert c.status_code == 200, c.text[:300]
        p = c.json()
        assert p["title"] == payload["title"]
        assert p["shop_slug"] == "dhaka-threads"
        assert p["price"] == 1234.0
        pid = p["id"]
        TestSeller.created.append(pid)

        # verify persisted via public detail
        g = client.get(f"{API}/products/{pid}")
        assert g.status_code == 200
        assert g.json()["product"]["title"] == payload["title"]

        # update
        payload2 = dict(payload, title="TEST_Product QA v2", price=999.0, stock=3)
        u = client.put(f"{API}/seller/products/{pid}", headers=h(seller_token), json=payload2)
        assert u.status_code == 200
        assert u.json()["title"] == "TEST_Product QA v2"
        g2 = client.get(f"{API}/products/{pid}").json()["product"]
        assert g2["price"] == 999.0 and g2["stock"] == 3

        # list count increased
        assert client.get(f"{API}/seller/products", headers=h(seller_token)).json()["total"] == before + 1

        # search filter
        s = client.get(f"{API}/seller/products?search=TEST_Product", headers=h(seller_token))
        assert s.status_code == 200 and s.json()["total"] >= 1

        # delete
        d = client.delete(f"{API}/seller/products/{pid}", headers=h(seller_token))
        assert d.status_code == 200
        TestSeller.created.remove(pid)
        assert client.get(f"{API}/products/{pid}").status_code == 404
        assert client.delete(f"{API}/seller/products/{pid}", headers=h(seller_token)).status_code == 404

    def test_bulk_action_grow(self, client, seller_token):
        payload = {"title": "TEST_Bulk", "price": 100.0, "stock": 1, "status": "draft"}
        pid = client.post(f"{API}/seller/products", headers=h(seller_token), json=payload).json()["id"]
        TestSeller.created.append(pid)
        r = client.post(f"{API}/seller/products/bulk", headers=h(seller_token), json={"product_ids": [pid], "action": "publish"})
        assert r.status_code == 200
        assert client.get(f"{API}/products/{pid}").json()["product"]["status"] == "published"
        rd = client.post(f"{API}/seller/products/bulk", headers=h(seller_token), json={"product_ids": [pid], "action": "delete"})
        assert rd.status_code == 200
        TestSeller.created.remove(pid)
        assert client.get(f"{API}/products/{pid}").status_code == 404

    def test_overview_orders_reviews_customers(self, client, seller_token):
        o = client.get(f"{API}/seller/overview", headers=h(seller_token))
        assert o.status_code == 200
        m = o.json()["metrics"]
        for k in ["revenue", "orders", "products", "published", "reviews", "rating"]:
            assert k in m
        for path in ["orders", "reviews", "customers"]:
            r = client.get(f"{API}/seller/{path}", headers=h(seller_token))
            assert r.status_code == 200, path
            assert isinstance(r.json(), list)

    def test_plans(self, client):
        r = client.get(f"{API}/subscriptions/plans")
        assert r.status_code == 200
        d = r.json()
        assert [p["id"] for p in d["plans"]] == ["start", "grow", "pro"]
        assert [p["price_bdt"] for p in d["plans"]] == [500, 1500, 3000]
        assert set(d["features"].keys()) == {"start", "grow", "pro"}

    def test_shop_update_and_publish(self, client, seller_token):
        orig = client.get(f"{API}/seller/me", headers=h(seller_token)).json()["shop"]
        r = client.put(f"{API}/seller/shop", headers=h(seller_token), json={"hero_heading": "TEST_Heading", "about": "TEST_About"})
        assert r.status_code == 200
        assert r.json()["hero_heading"] == "TEST_Heading"
        assert client.get(f"{API}/shops/dhaka-threads").json()["shop"]["hero_heading"] == "TEST_Heading"

        # accent color allowed on GROW
        r2 = client.put(f"{API}/seller/shop", headers=h(seller_token), json={"accent_color": "#123456"})
        assert r2.json()["accent_color"] == "#123456"

        # unpublish/publish
        assert client.post(f"{API}/seller/shop/unpublish", headers=h(seller_token)).json()["status"] == "draft"
        assert client.get(f"{API}/shops/dhaka-threads").status_code == 404
        assert client.post(f"{API}/seller/shop/publish", headers=h(seller_token)).json()["status"] == "published"
        assert client.get(f"{API}/shops/dhaka-threads").status_code == 200

        # restore
        restore = {"hero_heading": orig.get("hero_heading") or "Welcome", "about": orig.get("about") or ""}
        if orig.get("accent_color"):
            restore["accent_color"] = orig["accent_color"]
        client.put(f"{API}/seller/shop", headers=h(seller_token), json=restore)

    def test_subscription_change_and_start_gating(self, client, seller_token):
        shop_before = client.get(f"{API}/seller/me", headers=h(seller_token)).json()["shop"]
        try:
            r = client.post(f"{API}/seller/subscription", headers=h(seller_token), json={"plan": "start"})
            assert r.status_code == 200
            d = r.json()
            assert d["plan"]["id"] == "start"
            assert d["entitlements"]["theme_switching"] is False
            assert d["entitlements"]["max_products"] == 50
            assert client.get(f"{API}/seller/me", headers=h(seller_token)).json()["plan"]["id"] == "start"

            shop_before2 = client.get(f"{API}/seller/me", headers=h(seller_token)).json()["shop"]
            # theme_preset + accent_color must be ignored on START
            up = client.put(f"{API}/seller/shop", headers=h(seller_token),
                            json={"theme_preset": "tech_dark", "accent_color": "#ff0000", "hero_cta": "TEST_CTA"})
            assert up.status_code == 200
            assert up.json()["theme_preset"] == shop_before2["theme_preset"], "START plan must not change theme"
            assert up.json()["accent_color"] == shop_before2.get("accent_color"), "START plan must not set accent color"
            assert up.json()["hero_cta"] == "TEST_CTA"

            # bulk management blocked on START
            b = client.post(f"{API}/seller/products/bulk", headers=h(seller_token), json={"product_ids": [], "action": "publish"})
            assert b.status_code == 403

            # product limit architecture: START max 50 and seller has more than 50? check enforcement message
            count = client.get(f"{API}/seller/products", headers=h(seller_token)).json()["total"]
            create = client.post(f"{API}/seller/products", headers=h(seller_token),
                                 json={"title": "TEST_LimitCheck", "price": 10.0})
            if count >= 50:
                assert create.status_code == 403
            else:
                assert create.status_code == 200
                client.delete(f"{API}/seller/products/{create.json()['id']}", headers=h(seller_token))
        finally:
            back = client.post(f"{API}/seller/subscription", headers=h(seller_token), json={"plan": "grow"})
            assert back.status_code == 200
            client.put(f"{API}/seller/shop", headers=h(seller_token), json={"hero_cta": shop_before.get("hero_cta") or "Shop Now"})

    def test_invalid_plan(self, client, seller_token):
        r = client.post(f"{API}/seller/subscription", headers=h(seller_token), json={"plan": "platinum"})
        assert r.status_code == 400

    @classmethod
    def teardown_class(cls):
        pass


# ---------------- Commerce ----------------
class TestCommerce:
    def test_cart_sync(self, client, customer_token):
        pid = client.get(f"{API}/products?limit=2").json()["items"][0]["id"]
        r = client.post(f"{API}/cart/sync", headers=h(customer_token), json={"items": [{"product_id": pid, "qty": 2}]})
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 1 and items[0]["qty"] == 2 and items[0]["product"]["id"] == pid
        g = client.get(f"{API}/cart", headers=h(customer_token))
        assert g.status_code == 200 and g.json()["items"][0]["product"]["id"] == pid
        # clear
        assert client.post(f"{API}/cart/sync", headers=h(customer_token), json={"items": []}).json()["items"] == []

    def test_wishlist_sync(self, client, customer_token):
        pid = client.get(f"{API}/products?limit=3").json()["items"][1]["id"]
        r = client.post(f"{API}/wishlist/sync", headers=h(customer_token), json={"product_ids": [pid]})
        assert r.status_code == 200
        assert r.json()["product_ids"] == [pid]
        assert len(r.json()["products"]) == 1
        g = client.get(f"{API}/wishlist", headers=h(customer_token))
        assert g.json()["product_ids"] == [pid]
        client.post(f"{API}/wishlist/sync", headers=h(customer_token), json={"product_ids": []})

    def test_addresses_crud(self, client, customer_token):
        payload = {"label": "TEST_Home", "full_name": "QA Bot", "phone": "01700000000",
                   "address": "12 Test Road", "city": "Dhaka", "area": "Gulshan", "is_default": True}
        c = client.post(f"{API}/account/addresses", headers=h(customer_token), json=payload)
        assert c.status_code == 200
        a = c.json()
        assert a["label"] == "TEST_Home" and a["id"].startswith("addr_")
        lst = client.get(f"{API}/account/addresses", headers=h(customer_token)).json()
        assert any(x["id"] == a["id"] for x in lst)
        d = client.delete(f"{API}/account/addresses/{a['id']}", headers=h(customer_token))
        assert d.status_code == 200
        lst2 = client.get(f"{API}/account/addresses", headers=h(customer_token)).json()
        assert not any(x["id"] == a["id"] for x in lst2)

    def test_checkout_groups_by_shop_and_orders(self, client, customer_token):
        prods = client.get(f"{API}/products?limit=100").json()["items"]
        by_shop = {}
        for p in prods:
            by_shop.setdefault(p["shop_id"], p)
            if len(by_shop) == 2:
                break
        assert len(by_shop) == 2, "need products from 2 shops"
        items = [{"product_id": p["id"], "qty": 1} for p in by_shop.values()]
        r = client.post(f"{API}/checkout", headers=h(customer_token), json={"items": items})
        assert r.status_code == 200, r.text[:300]
        orders = r.json()["orders"]
        assert len(orders) == 2, f"expected 2 orders grouped by shop, got {len(orders)}"
        assert all(o["status"] == "pending" and o["total"] > 0 for o in orders)
        mine = client.get(f"{API}/account/orders", headers=h(customer_token))
        assert mine.status_code == 200
        ids = [o["id"] for o in mine.json()]
        assert all(o["id"] in ids for o in orders)

    def test_commerce_requires_auth(self, client):
        assert client.get(f"{API}/cart").status_code == 401
        assert client.get(f"{API}/account/orders").status_code == 401
        assert client.post(f"{API}/checkout", json={"items": []}).status_code == 401


# ---------------- Reviews ----------------
class TestReviews:
    def test_create_review_updates_rating(self, client, customer_token):
        pid = client.get(f"{API}/products?limit=5").json()["items"][4]["id"]
        r = client.post(f"{API}/reviews", headers=h(customer_token), json={"product_id": pid, "rating": 5, "comment": "TEST_review great"})
        assert r.status_code == 200, r.text[:300]
        rev = r.json()
        assert rev["rating"] == 5 and rev["product_id"] == pid
        detail = client.get(f"{API}/products/{pid}").json()
        assert any(x["id"] == rev["id"] for x in detail["reviews"])
        assert detail["product"]["review_count"] >= 1
        assert 1 <= detail["product"]["rating"] <= 5

    def test_review_clamped_and_404(self, client, customer_token):
        pid = client.get(f"{API}/products?limit=6").json()["items"][5]["id"]
        r = client.post(f"{API}/reviews", headers=h(customer_token), json={"product_id": pid, "rating": 99, "comment": "TEST_clamp"})
        assert r.status_code == 200
        assert r.json()["rating"] == 5
        r2 = client.post(f"{API}/reviews", headers=h(customer_token), json={"product_id": "nope", "rating": 3, "comment": "x"})
        assert r2.status_code == 404
        assert client.post(f"{API}/reviews", json={"product_id": pid, "rating": 3, "comment": "x"}).status_code == 401

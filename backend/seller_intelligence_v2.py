"""Nexora Marketplace Intelligence v2.

Uses live Nexora catalogue/order data and falls back to historical sold_count
signals when the local demo database has little recent order history. All
cross-seller price/demand views are aggregated and privacy-safe.
"""
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from statistics import median

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import db
from entitlements import get_entitlements
from security import require_role
import seller

router = APIRouter()
seller_dep = require_role("seller")


def _dt(value):
    try:
        result = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if result.tzinfo is None:
            result = result.replace(tzinfo=timezone.utc)
        return result
    except Exception:
        return None


def _trend(current, previous):
    current, previous = int(current or 0), int(previous or 0)
    if previous <= 0:
        return 100 if current > 0 else 0
    return round(((current - previous) / previous) * 100)


def _level(score):
    score = float(score or 0)
    return "high" if score >= 70 else "medium" if score >= 38 else "low"


def _confidence(recent_units, product_count, seller_count):
    evidence = int(recent_units or 0) + min(30, int(product_count or 0)) + min(20, int(seller_count or 0) * 3)
    return "high" if evidence >= 45 else "medium" if evidence >= 18 else "low"


async def _require_intelligence(user):
    profile, shop, sub, plan_id = await seller._seller_context(user)
    if not shop:
        raise HTTPException(400, "Complete seller onboarding first")
    if not get_entitlements(plan_id).get("marketplace_intelligence"):
        raise HTTPException(403, "Nexora Marketplace Intelligence requires the PRO plan")
    return profile, shop, sub, plan_id


async def build_overview(user):
    _, shop, _, plan_id = await _require_intelligence(user)
    products = await db.products.find(
        {"status": "published"},
        {"_id": 0, "id": 1, "shop_id": 1, "seller_id": 1, "title": 1, "category": 1, "price": 1, "discount_price": 1, "stock": 1, "sold_count": 1, "rating": 1, "review_count": 1},
    ).to_list(30000)
    own_products = [p for p in products if p.get("shop_id") == shop.get("id")]
    own_categories = {p.get("category") for p in own_products if p.get("category")}
    if shop.get("category"):
        own_categories.add(shop["category"])

    by_id = {p.get("id"): p for p in products if p.get("id")}
    now = datetime.now(timezone.utc)
    previous_cutoff, recent_cutoff = now - timedelta(days=28), now - timedelta(days=14)
    orders = await db.orders.find({"created_at": {"$gte": previous_cutoff.isoformat()}}, {"_id": 0, "items": 1, "created_at": 1}).to_list(50000)
    recent_units, previous_units = defaultdict(int), defaultdict(int)
    recent_orders = 0
    for order in orders:
        created = _dt(order.get("created_at"))
        if not created:
            continue
        target = recent_units if created >= recent_cutoff else previous_units
        if created >= recent_cutoff:
            recent_orders += 1
        for item in order.get("items") or []:
            product = by_id.get(item.get("product_id"))
            if not product:
                continue
            category = product.get("category") or "other"
            try:
                qty = max(0, int(item.get("qty") or 0))
            except Exception:
                qty = 0
            target[category] += qty

    stats = defaultdict(lambda: {"product_count": 0, "seller_ids": set(), "sold_all_time": 0, "prices": [], "ratings": [], "reviews": 0})
    for product in products:
        category = product.get("category") or "other"
        row = stats[category]
        row["product_count"] += 1
        if product.get("seller_id"):
            row["seller_ids"].add(product["seller_id"])
        try:
            row["sold_all_time"] += max(0, int(product.get("sold_count") or 0))
        except Exception:
            pass
        value = product.get("discount_price") if product.get("discount_price") is not None else product.get("price")
        if isinstance(value, (int, float)) and value > 0:
            row["prices"].append(float(value))
        if isinstance(product.get("rating"), (int, float)):
            row["ratings"].append(float(product["rating"]))
        try:
            row["reviews"] += max(0, int(product.get("review_count") or 0))
        except Exception:
            pass

    max_recent = max([recent_units[c] for c in stats] or [0])
    max_sold = max([stats[c]["sold_all_time"] for c in stats] or [1])
    max_reviews = max([stats[c]["reviews"] for c in stats] or [1])
    has_recent_signal = max_recent > 0
    rows = []
    for category, row in stats.items():
        recent, previous = recent_units[category], previous_units[category]
        recent_norm = recent / max_recent if max_recent else 0
        historical_norm = row["sold_all_time"] / max(max_sold, 1)
        review_norm = row["reviews"] / max(max_reviews, 1)
        if has_recent_signal:
            demand_score = round(min(100, (recent_norm * 0.60 + historical_norm * 0.30 + review_norm * 0.10) * 100))
            activity_basis = "recent + historical"
        else:
            demand_score = round(min(100, (historical_norm * 0.78 + review_norm * 0.22) * 100))
            activity_basis = "historical catalogue"
        seller_count = len(row["seller_ids"])
        competition_penalty = min(42, max(0, seller_count - 1) * 4 + max(0, row["product_count"] - 8) * 0.35)
        opportunity = round(max(0, min(100, demand_score + 24 - competition_penalty)))
        rows.append({
            "category": category,
            "recent_units_14d": recent,
            "previous_units_14d": previous,
            "demand_change_pct": _trend(recent, previous),
            "demand_score": demand_score,
            "demand_level": _level(demand_score),
            "opportunity_score": opportunity,
            "competition": "low" if seller_count <= 2 else "medium" if seller_count <= 6 else "high",
            "seller_count": seller_count,
            "product_count": row["product_count"],
            "market_price_median": round(median(row["prices"]), 2) if row["prices"] else None,
            "market_rating_average": round(sum(row["ratings"]) / len(row["ratings"]), 2) if row["ratings"] else None,
            "confidence": _confidence(recent, row["product_count"], seller_count),
            "catalog_match": 100 if category in own_categories else 0,
            "activity_basis": activity_basis,
        })

    matching = [row for row in rows if row["catalog_match"]]
    opportunity_pool = matching if matching else rows
    opportunities = sorted(opportunity_pool, key=lambda row: (row["opportunity_score"], row["demand_score"], row["product_count"]), reverse=True)[:8]
    market_opportunities = sorted(rows, key=lambda row: (row["opportunity_score"], row["demand_score"]), reverse=True)[:8]

    pricing = []
    for product in own_products[:250]:
        category = product.get("category") or "other"
        competitors = [x for x in products if (x.get("category") or "other") == category and x.get("shop_id") != shop.get("id")]
        competitor_shops = {x.get("shop_id") for x in competitors if x.get("shop_id")}
        competitor_prices = []
        for other in competitors:
            value = other.get("discount_price") if other.get("discount_price") is not None else other.get("price")
            if isinstance(value, (int, float)) and value > 0:
                competitor_prices.append(float(value))
        if len(competitor_prices) < 3 or len(competitor_shops) < 2:
            continue
        your_price = product.get("discount_price") if product.get("discount_price") is not None else product.get("price")
        if not isinstance(your_price, (int, float)) or your_price <= 0:
            continue
        benchmark = median(competitor_prices)
        diff = round(((float(your_price) - benchmark) / benchmark) * 100, 1) if benchmark else 0
        pricing.append({"product_id": product.get("id"), "title": product.get("title"), "category": category, "your_price": float(your_price), "market_median": round(benchmark, 2), "difference_pct": diff, "sample_products": len(competitor_prices), "sample_stores": len(competitor_shops), "signal": "above" if diff > 5 else "below" if diff < -5 else "aligned"})
    pricing = sorted(pricing, key=lambda x: abs(x["difference_pct"]), reverse=True)[:12]

    low_stock = []
    for product in own_products:
        try:
            stock = int(product.get("stock") or 0)
        except Exception:
            stock = 0
        if stock <= 5:
            low_stock.append({"id": product.get("id"), "title": product.get("title"), "stock": stock, "category": product.get("category") or "other", "sold_count": int(product.get("sold_count") or 0)})
    low_stock.sort(key=lambda x: (-x["sold_count"], x["stock"]))
    low_stock = low_stock[:12]

    recommendations = []
    if opportunities:
        top = opportunities[0]
        recommendations.append({"type": "demand", "title": f"{top['category']} is your strongest current category signal", "message": f"Opportunity score {top['opportunity_score']}/100, demand {top['demand_score']}/100 and {top['competition']} competition. Signal basis: {top['activity_basis']}.", "score": top["opportunity_score"]})
    if pricing:
        p = pricing[0]
        recommendations.append({"type": "pricing", "title": f"Review {p['title']}", "message": f"Your price is {abs(p['difference_pct'])}% {'above' if p['difference_pct'] > 0 else 'below'} the privacy-safe market median.", "score": min(100, round(abs(p["difference_pct"]) * 3))})
    if low_stock:
        recommendations.append({"type": "stock", "title": f"{len(low_stock)} products need stock attention", "message": "Prioritize low-stock items that already have strong historical sales.", "score": 70})

    return {
        "plan": plan_id,
        "privacy": "Marketplace benchmarks are aggregated. Nexora does not expose another seller's private revenue, customer list or individual order totals.",
        "data_window": "Latest 14 days vs previous 14 days" if has_recent_signal else "Recent order data is sparse; historical catalogue sales/review signals are being used",
        "signal_mode": "recent_orders" if has_recent_signal else "historical_fallback",
        "opportunities": opportunities,
        "market_opportunities": market_opportunities,
        "pricing_benchmarks": pricing,
        "low_stock": low_stock,
        "recommendations": recommendations,
        "marketplace_summary": {"published_products": len(products), "categories_measured": len(stats), "your_published_products": len(own_products), "recent_orders_measured": recent_orders, "your_categories": sorted(own_categories)},
    }


@router.get("/seller/intelligence/overview")
async def intelligence_overview(user: dict = Depends(seller_dep)):
    return await build_overview(user)


class AskBody(BaseModel):
    question: str = Field(min_length=2, max_length=800)


@router.post("/seller/intelligence/ask")
async def intelligence_ask(body: AskBody, user: dict = Depends(seller_dep)):
    data = await build_overview(user)
    q = body.question.lower().strip()
    if any(word in q for word in ("demand", "trend", "sell", "opportunity", "product", "category")):
        if not data["opportunities"]:
            answer = "I do not have enough catalogue activity to rank a demand opportunity yet."
        else:
            top = data["opportunities"][0]
            answer = f"Your strongest current match is {top['category']}: opportunity {top['opportunity_score']}/100, demand {top['demand_score']}/100, {top['competition']} competition and {top['confidence']} confidence. This is based on {top['activity_basis']} signals."
    elif any(word in q for word in ("price", "pricing", "cheap", "expensive", "median")):
        if not data["pricing_benchmarks"]:
            answer = "I cannot show a privacy-safe pricing comparison yet. Nexora needs at least 3 comparable products from at least 2 other stores."
        else:
            p = data["pricing_benchmarks"][0]
            direction = "above" if p["difference_pct"] > 0 else "below" if p["difference_pct"] < 0 else "aligned with"
            answer = f"{p['title']} is ৳{p['your_price']:,.0f}; the anonymous market median is ৳{p['market_median']:,.0f}. Your price is {abs(p['difference_pct'])}% {direction} the benchmark."
    elif any(word in q for word in ("stock", "inventory", "restock")):
        if not data["low_stock"]:
            answer = "No measured product is currently at 5 units of stock or below."
        else:
            answer = "Restock priority: " + ", ".join(f"{p['title']} ({p['stock']} left)" for p in data["low_stock"][:5]) + "."
    elif any(word in q for word in ("market", "marketplace", "new category", "expand")):
        rows = data.get("market_opportunities") or []
        answer = "Top marketplace signals: " + "; ".join(f"{r['category']} {r['opportunity_score']}/100" for r in rows[:4]) + "." if rows else "Nexora does not yet have enough marketplace data for an expansion recommendation."
    elif any(word in q for word in ("summary", "recommend", "what should", "next")):
        messages = [r["message"] for r in data["recommendations"][:3]]
        answer = " ".join(messages) if messages else "Keep collecting catalogue and order activity; no strong recommendation is available yet."
    else:
        top = data["opportunities"][0] if data["opportunities"] else None
        answer = "I can help with demand, pricing, stock and marketplace expansion. " + (f"Right now {top['category']} is your strongest matched signal at {top['opportunity_score']}/100." if top else "Ask me about demand, pricing or stock.")
    return {"answer": answer, "engine": "nexora-intelligence-v2", "uses_aggregated_marketplace_data": True, "signal_mode": data.get("signal_mode")}

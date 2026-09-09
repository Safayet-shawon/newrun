"""PRO-only marketplace intelligence with aggregated, privacy-safe benchmarks."""
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


def _iso_days_ago(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def _trend(current: int, previous: int) -> int:
    if previous <= 0:
        return 100 if current > 0 else 0
    return round(((current - previous) / previous) * 100)


def _level(score: int) -> str:
    if score >= 75:
        return "high"
    if score >= 45:
        return "medium"
    return "low"


def _confidence(recent_units: int, product_count: int) -> str:
    if recent_units >= 20 and product_count >= 10:
        return "high"
    if recent_units >= 5 and product_count >= 5:
        return "medium"
    return "low"


async def _require_intelligence(user: dict):
    profile, shop, sub, plan_id = await seller._seller_context(user)
    if not shop:
        raise HTTPException(status_code=400, detail="Complete seller onboarding first")
    if not get_entitlements(plan_id).get("marketplace_intelligence"):
        raise HTTPException(status_code=403, detail="Nexora Marketplace Intelligence requires the PRO plan")
    return profile, shop, sub, plan_id


async def build_overview(user: dict) -> dict:
    _, shop, _, plan_id = await _require_intelligence(user)

    products = await db.products.find(
        {"status": "published"},
        {
            "_id": 0,
            "id": 1,
            "shop_id": 1,
            "seller_id": 1,
            "title": 1,
            "category": 1,
            "price": 1,
            "discount_price": 1,
            "stock": 1,
            "sold_count": 1,
        },
    ).to_list(10000)

    by_id = {p["id"]: p for p in products if p.get("id")}
    own_products = [p for p in products if p.get("shop_id") == shop["id"]]
    own_categories = {p.get("category") for p in own_products if p.get("category")}
    if shop.get("category"):
        own_categories.add(shop["category"])

    orders = await db.orders.find(
        {"created_at": {"$gte": _iso_days_ago(28)}},
        {"_id": 0, "items": 1, "created_at": 1},
    ).to_list(20000)

    now = datetime.now(timezone.utc)
    recent_cutoff = now - timedelta(days=14)
    recent_units = defaultdict(int)
    previous_units = defaultdict(int)

    for order in orders:
        try:
            created = datetime.fromisoformat(str(order.get("created_at")).replace("Z", "+00:00"))
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
        except Exception:
            continue
        target = recent_units if created >= recent_cutoff else previous_units
        for item in order.get("items", []):
            product = by_id.get(item.get("product_id"))
            if not product:
                continue
            category = product.get("category") or "other"
            try:
                qty = max(0, int(item.get("qty", 0)))
            except Exception:
                qty = 0
            target[category] += qty

    stats = defaultdict(lambda: {
        "product_count": 0,
        "seller_ids": set(),
        "sold_all_time": 0,
        "prices": [],
    })

    for p in products:
        category = p.get("category") or "other"
        row = stats[category]
        row["product_count"] += 1
        if p.get("seller_id"):
            row["seller_ids"].add(p["seller_id"])
        row["sold_all_time"] += int(p.get("sold_count") or 0)
        price = p.get("discount_price")
        if price is None:
            price = p.get("price")
        if isinstance(price, (int, float)) and price >= 0:
            row["prices"].append(float(price))

    max_recent = max([recent_units[c] for c in stats] or [1])
    max_sold = max([stats[c]["sold_all_time"] for c in stats] or [1])

    category_rows = []
    for category, row in stats.items():
        recent = recent_units[category]
        previous = previous_units[category]
        recent_norm = recent / max(max_recent, 1)
        sold_norm = row["sold_all_time"] / max(max_sold, 1)
        demand_score = round(min(100, (recent_norm * 70 + sold_norm * 30) * 100))
        seller_count = len(row["seller_ids"])
        supply_penalty = min(35, seller_count * 4)
        opportunity_score = max(0, min(100, demand_score + 25 - supply_penalty))

        category_rows.append({
            "category": category,
            "recent_units_14d": recent,
            "previous_units_14d": previous,
            "demand_change_pct": _trend(recent, previous),
            "demand_score": demand_score,
            "demand_level": _level(demand_score),
            "opportunity_score": opportunity_score,
            "competition": "low" if seller_count <= 2 else "medium" if seller_count <= 6 else "high",
            "seller_count": seller_count,
            "product_count": row["product_count"],
            "market_price_median": round(median(row["prices"]), 2) if row["prices"] else None,
            "confidence": _confidence(recent, row["product_count"]),
            "catalog_match": 100 if category in own_categories else 0,
        })

    matching = [r for r in category_rows if r["catalog_match"] > 0]
    opportunity_source = matching if matching else category_rows
    opportunities = sorted(
        opportunity_source,
        key=lambda r: (r["opportunity_score"], r["demand_score"]),
        reverse=True,
    )[:6]

    pricing = []
    for p in own_products[:100]:
        category = p.get("category") or "other"
        competitors = [
            x for x in products
            if (x.get("category") or "other") == category and x.get("shop_id") != shop["id"]
        ]
        competitor_shops = {x.get("shop_id") for x in competitors if x.get("shop_id")}
        competitor_prices = []
        for x in competitors:
            value = x.get("discount_price")
            if value is None:
                value = x.get("price")
            if isinstance(value, (int, float)) and value >= 0:
                competitor_prices.append(float(value))

        # Privacy threshold: do not benchmark against a tiny identifiable sample.
        if len(competitor_prices) < 3 or len(competitor_shops) < 2:
            continue

        your_price = p.get("discount_price")
        if your_price is None:
            your_price = p.get("price")
        if not isinstance(your_price, (int, float)):
            continue

        benchmark = median(competitor_prices)
        diff = 0 if benchmark == 0 else round(((float(your_price) - benchmark) / benchmark) * 100, 1)
        pricing.append({
            "product_id": p.get("id"),
            "title": p.get("title"),
            "category": category,
            "your_price": float(your_price),
            "market_median": round(benchmark, 2),
            "difference_pct": diff,
            "sample_products": len(competitor_prices),
            "sample_stores": len(competitor_shops),
            "signal": "above" if diff > 5 else "below" if diff < -5 else "aligned",
        })

    pricing = sorted(pricing, key=lambda x: abs(x["difference_pct"]), reverse=True)[:8]

    own_low_stock = [
        {
            "id": p.get("id"),
            "title": p.get("title"),
            "stock": int(p.get("stock") or 0),
            "category": p.get("category") or "other",
        }
        for p in own_products
        if int(p.get("stock") or 0) <= 5
    ][:8]

    recommendations = []
    if opportunities:
        top = opportunities[0]
        recommendations.append({
            "type": "demand",
            "title": f"{top['category']} shows a marketplace opportunity",
            "message": (
                f"Demand score is {top['demand_score']}/100 with {top['competition']} competition. "
                f"Confidence: {top['confidence']}."
            ),
            "score": top["opportunity_score"],
        })

    if pricing:
        top_price = pricing[0]
        direction = "above" if top_price["difference_pct"] > 0 else "below"
        recommendations.append({
            "type": "pricing",
            "title": f"Review the price of {top_price['title']}",
            "message": (
                f"Your current price is {abs(top_price['difference_pct'])}% {direction} "
                f"the anonymous marketplace median for this category."
            ),
            "score": min(100, round(abs(top_price["difference_pct"]) * 3)),
        })

    if own_low_stock:
        recommendations.append({
            "type": "stock",
            "title": f"{len(own_low_stock)} product(s) are low in stock",
            "message": "Restock high-demand items first so you do not lose marketplace demand.",
            "score": 70,
        })

    return {
        "plan": plan_id,
        "privacy": "Marketplace benchmarks are aggregated. Nexora does not expose another seller's private revenue or order data.",
        "data_window": "Latest 14 days compared with the previous 14 days",
        "opportunities": opportunities,
        "pricing_benchmarks": pricing,
        "low_stock": own_low_stock,
        "recommendations": recommendations,
        "marketplace_summary": {
            "published_products": len(products),
            "categories_measured": len(stats),
            "your_published_products": len(own_products),
        },
    }


@router.get("/seller/intelligence/overview")
async def intelligence_overview(user: dict = Depends(seller_dep)):
    return await build_overview(user)


class AskBody(BaseModel):
    question: str = Field(min_length=2, max_length=500)


@router.post("/seller/intelligence/ask")
async def intelligence_ask(body: AskBody, user: dict = Depends(seller_dep)):
    data = await build_overview(user)
    q = body.question.lower()

    if any(word in q for word in ("demand", "trend", "product", "sell", "opportunity")):
        if not data["opportunities"]:
            answer = "There is not enough marketplace activity yet to identify a confident demand opportunity."
        else:
            top = data["opportunities"][0]
            answer = (
                f"Your strongest current marketplace match is {top['category']}. "
                f"It has a demand score of {top['demand_score']}/100, {top['competition']} competition, "
                f"and an opportunity score of {top['opportunity_score']}/100. Confidence is {top['confidence']}."
            )
    elif any(word in q for word in ("price", "pricing", "cheap", "expensive")):
        if not data["pricing_benchmarks"]:
            answer = "I do not yet have a privacy-safe pricing sample large enough for your products."
        else:
            p = data["pricing_benchmarks"][0]
            answer = (
                f"For {p['title']}, your price is ৳{p['your_price']:,.0f}. "
                f"The anonymous marketplace median is ৳{p['market_median']:,.0f}, so you are "
                f"{abs(p['difference_pct'])}% {'above' if p['difference_pct'] > 0 else 'below'} the benchmark."
            )
    elif any(word in q for word in ("stock", "inventory", "restock")):
        if not data["low_stock"]:
            answer = "Your currently measured catalogue does not have any products at 5 units or below."
        else:
            names = ", ".join(x["title"] for x in data["low_stock"][:3])
            answer = f"Restock attention is needed for: {names}. Prioritize items that also appear in a high-demand category."
    else:
        pieces = [r["message"] for r in data["recommendations"][:3]]
        answer = " ".join(pieces) if pieces else "Nexora needs more marketplace activity before it can produce a strong recommendation."

    return {
        "answer": answer,
        "engine": "nexora-intelligence-v1",
        "uses_aggregated_marketplace_data": True,
    }

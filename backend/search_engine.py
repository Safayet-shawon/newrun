"""Nexora marketplace search helpers.

The goal is forgiving ecommerce search rather than literal string matching.
It handles spacing/hyphen/plural differences, common Bangladesh shopping words,
Bangla/Banglish aliases, and light fuzzy typo matching.
"""

from __future__ import annotations

from difflib import SequenceMatcher
import re
import unicodedata
from typing import Iterable

from db import db


# Keep these groups focused on shopping intent. The engine also performs generic
# morphology/fuzzy matching, so new products are not limited to this dictionary.
SYNONYM_GROUPS = {
    "t shirt": {
        "t shirt", "tshirt", "t-shirt", "t shirts", "tshirts", "t-shirts", "tee", "tees",
        "genji", "ganji", "gengi", "gol gola genji", "gol gola ganji", "round neck tee",
        "round neck t shirt", "crew neck tee", "টি শার্ট", "টিশার্ট", "গেঞ্জি", "গোল গলা গেঞ্জি",
    },
    "shirt": {"shirt", "shirts", "formal shirt", "casual shirt", "শার্ট"},
    "polo": {"polo", "polo shirt", "collar t shirt", "collar tee", "কলার গেঞ্জি", "পোলো"},
    "panjabi": {"panjabi", "punjabi", "panjabi dress", "kurta men", "পাঞ্জাবি", "পাঞ্জাবী"},
    "trouser": {"trouser", "trousers", "pant", "pants", "formal pant", "chino", "chinos", "প্যান্ট", "ট্রাউজার"},
    "jeans": {"jean", "jeans", "denim", "denim pant", "জিন্স", "ডেনিম"},
    "shoe": {"shoe", "shoes", "juta", "footwear", "জুতা", "জুতো"},
    "sneaker": {"sneaker", "sneakers", "trainer", "trainers", "keds", "sports shoe", "running shoe", "স্নিকার", "কেডস"},
    "sandal": {"sandal", "sandals", "slipper", "slippers", "slide", "slides", "স্যান্ডেল", "চপ্পল"},
    "saree": {"saree", "sari", "sharee", "শাড়ি", "শাড়ি"},
    "salwar kameez": {"salwar", "salwar kameez", "shalwar", "shalwar kameez", "three piece", "3 piece", "থ্রি পিস", "সালোয়ার কামিজ", "সালওয়ার কামিজ"},
    "kurti": {"kurti", "kurta women", "ladies kurti", "কুর্তি"},
    "abaya": {"abaya", "borka", "burqa", "burkha", "বোরকা", "আবায়া", "আবায়া"},
    "hijab": {"hijab", "scarf muslim", "হিজাব"},
    "bag": {"bag", "bags", "hand bag", "handbag", "handbags", "purse", "purses", "ব্যাগ", "হ্যান্ডব্যাগ"},
    "backpack": {"backpack", "back pack", "school bag", "rucksack", "ব্যাকপ্যাক", "স্কুল ব্যাগ"},
    "watch": {"watch", "watches", "wrist watch", "ঘড়ি", "ঘড়ি"},
    "smart watch": {"smart watch", "smartwatch", "smart watches", "fitness watch", "স্মার্টওয়াচ", "স্মার্ট ওয়াচ"},
    "mobile": {"mobile", "mobile phone", "phone", "phones", "smartphone", "smart phone", "handset", "মোবাইল", "ফোন", "স্মার্টফোন"},
    "earbuds": {"earbud", "earbuds", "ear buds", "tws", "wireless earbuds", "bluetooth earbuds", "ইয়ারবাড", "ইয়ারবাডস", "ইয়ারবাড"},
    "earphone": {"earphone", "earphones", "ear phone", "wired earphone", "ইয়ারফোন", "ইয়ারফোন"},
    "headphone": {"headphone", "headphones", "head set", "headset", "হেডফোন", "হেডসেট"},
    "charger": {"charger", "chargers", "adapter", "charging adapter", "phone charger", "চার্জার", "অ্যাডাপ্টার"},
    "power bank": {"power bank", "powerbank", "portable charger", "পাওয়ার ব্যাংক", "পাওয়ার ব্যাংক"},
    "laptop": {"laptop", "notebook computer", "notebook pc", "ল্যাপটপ"},
    "keyboard": {"keyboard", "key board", "gaming keyboard", "কীবোর্ড", "কি বোর্ড"},
    "mouse": {"mouse", "computer mouse", "gaming mouse", "মাউস"},
    "camera": {"camera", "dslr", "mirrorless camera", "ক্যামেরা"},
    "television": {"tv", "television", "smart tv", "android tv", "টিভি", "টেলিভিশন"},
    "refrigerator": {"fridge", "refrigerator", "freezer", "ফ্রিজ", "রেফ্রিজারেটর"},
    "air conditioner": {"ac", "air conditioner", "air conditioning", "এসি", "এয়ার কন্ডিশনার", "এয়ার কন্ডিশনার"},
    "lipstick": {"lipstick", "lip stick", "lip color", "lip colour", "লিপস্টিক"},
    "foundation": {"foundation", "makeup foundation", "face foundation", "ফাউন্ডেশন"},
    "face wash": {"face wash", "facewash", "facial cleanser", "cleanser", "ফেসওয়াশ", "ফেস ওয়াশ"},
    "moisturizer": {"moisturizer", "moisturiser", "moisturizing cream", "face cream", "ময়েশ্চারাইজার", "ময়েশ্চারাইজার"},
    "sunscreen": {"sunscreen", "sun screen", "sunblock", "spf", "সানস্ক্রিন", "সানব্লক"},
    "perfume": {"perfume", "fragrance", "attar", "body spray", "body mist", "পারফিউম", "আতর"},
    "toy": {"toy", "toys", "khelna", "kids toy", "খেলনা"},
    "cat food": {"cat food", "kitten food", "cat feed", "বিড়ালের খাবার", "বিড়ালের খাবার", "ক্যাট ফুড"},
    "dog food": {"dog food", "puppy food", "dog feed", "কুকুরের খাবার", "ডগ ফুড"},
    "cat litter": {"cat litter", "litter", "kitty litter", "cat sand", "ক্যাট লিটার", "বিড়ালের লিটার", "বিড়ালের লিটার"},
    "pet toy": {"pet toy", "cat toy", "dog toy", "pet toys", "পেট টয়", "পোষা প্রাণীর খেলনা"},
    "sofa": {"sofa", "sofa set", "couch", "সোফা", "সোফা সেট"},
    "bed": {"bed", "beds", "bedstead", "খাট", "বেড"},
    "chair": {"chair", "chairs", "office chair", "চেয়ার", "চেয়ার"},
    "table": {"table", "tables", "desk", "টেবিল", "ডেস্ক"},
}


SEARCH_FIELDS = (
    "title",
    "description",
    "brand",
    "category",
    "tags",
    "shop_name",
    "sku",
    "attributes",
    "specs",
)


def normalize_text(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).lower().strip()
    text = text.replace("&", " and ")
    text = re.sub(r"[_/\\|+]+", " ", text)
    text = re.sub(r"[-–—]+", " ", text)
    text = re.sub(r"[^\w\u0980-\u09ff]+", " ", text, flags=re.UNICODE)
    return re.sub(r"\s+", " ", text).strip()


def compact(value: str) -> str:
    return re.sub(r"\s+", "", normalize_text(value))


def _basic_forms(term: str) -> set[str]:
    term = normalize_text(term)
    if not term:
        return set()
    forms = {term, compact(term)}
    words = term.split()
    if words:
        last = words[-1]
        if last.endswith("ies") and len(last) > 3:
            forms.add(" ".join(words[:-1] + [last[:-3] + "y"]))
        elif last.endswith("es") and len(last) > 3:
            forms.add(" ".join(words[:-1] + [last[:-2]]))
        elif last.endswith("s") and len(last) > 2:
            forms.add(" ".join(words[:-1] + [last[:-1]]))
        elif re.fullmatch(r"[a-z0-9]+", last):
            forms.add(" ".join(words[:-1] + [last + "s"]))
    return {f for f in forms if f}


def _same_form(a: str, b: str) -> bool:
    aa, bb = compact(a), compact(b)
    if not aa or not bb:
        return False
    if aa == bb:
        return True
    if aa.rstrip("s") == bb.rstrip("s") and min(len(aa), len(bb)) >= 3:
        return True
    return SequenceMatcher(None, aa, bb).ratio() >= 0.90


def expand_query(query: str, max_terms: int = 28) -> dict:
    normalized = normalize_text(query)
    if not normalized:
        return {"original": query, "normalized": "", "canonical": "", "terms": []}

    terms: set[str] = set(_basic_forms(normalized))
    canonical = normalized

    # Match a synonym family even when the user changes hyphens/spaces/plurals.
    for family, aliases in SYNONYM_GROUPS.items():
        aliases_with_family = set(aliases) | {family}
        if any(_same_form(normalized, alias) or normalize_text(alias) in normalized for alias in aliases_with_family):
            canonical = family
            for alias in aliases_with_family:
                terms.update(_basic_forms(alias))

    # Add useful whole-query and token morphology for products not in our alias map.
    for token in normalized.split():
        if len(token) >= 3:
            terms.update(_basic_forms(token))

    # Prefer human-readable forms before compact fallback forms.
    ordered = sorted(terms, key=lambda x: (" " not in x, abs(len(x) - len(normalized)), x))
    return {
        "original": query,
        "normalized": normalized,
        "canonical": canonical,
        "terms": ordered[:max_terms],
    }


def term_regex(term: str) -> str:
    norm = normalize_text(term)
    if not norm:
        return ""
    parts = [re.escape(p) for p in norm.split() if p]
    if not parts:
        return ""
    pattern = r"[\s\-_]*".join(parts)
    # English shopping nouns are frequently singular/plural variants.
    if re.fullmatch(r"[a-z0-9\s]+", norm) and not norm.endswith("s"):
        pattern += "s?"
    return pattern


def mongo_text_clause(query: str, fields: Iterable[str] = SEARCH_FIELDS) -> dict:
    info = expand_query(query)
    regexes = []
    for term in info["terms"]:
        pattern = term_regex(term)
        if pattern and pattern not in regexes:
            regexes.append(pattern)
    regexes = regexes[:20]
    if not regexes:
        return {}
    return {
        "$or": [
            {field: {"$regex": pattern, "$options": "i"}}
            for field in fields
            for pattern in regexes
        ]
    }


def _flatten(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, dict):
        return " ".join(f"{k} {_flatten(v)}" for k, v in value.items())
    if isinstance(value, (list, tuple, set)):
        return " ".join(_flatten(v) for v in value)
    return str(value)


def searchable_text(document: dict) -> str:
    parts = []
    for field in SEARCH_FIELDS:
        parts.append(_flatten(document.get(field)))
    return normalize_text(" ".join(parts))


def relevance_score(query: str, document: dict) -> float:
    info = expand_query(query)
    normalized = info["normalized"]
    if not normalized:
        return 0.0

    title = normalize_text(document.get("title"))
    brand = normalize_text(document.get("brand"))
    category = normalize_text(document.get("category"))
    shop_name = normalize_text(document.get("shop_name"))
    text = searchable_text(document)
    compact_text = compact(text)

    score = 0.0
    if normalized == title:
        score += 130
    elif normalized in title:
        score += 90
    if normalized and normalized in brand:
        score += 55
    if normalized and normalized in category:
        score += 45
    if normalized and normalized in shop_name:
        score += 30

    best_alias = 0.0
    for term in info["terms"]:
        norm_term = normalize_text(term)
        if not norm_term:
            continue
        if norm_term in title:
            best_alias = max(best_alias, 75.0)
        elif norm_term in text:
            best_alias = max(best_alias, 45.0)
        elif compact(norm_term) and compact(norm_term) in compact_text:
            best_alias = max(best_alias, 40.0)
    score += best_alias

    q_tokens = [t for t in normalized.split() if len(t) > 1]
    text_tokens = set(text.split())
    if q_tokens:
        overlap = sum(1 for token in q_tokens if token in text_tokens)
        score += (overlap / len(q_tokens)) * 35

    # Fuzzy typo tolerance. Compare query with title and title tokens/phrases.
    if title:
        score += SequenceMatcher(None, compact(normalized), compact(title)).ratio() * 28
        title_tokens = title.split()
        for n in (1, 2, 3):
            for i in range(max(0, len(title_tokens) - n + 1)):
                phrase = " ".join(title_tokens[i:i+n])
                ratio = SequenceMatcher(None, compact(normalized), compact(phrase)).ratio()
                if ratio >= 0.72:
                    score = max(score, 28 + ratio * 38)

    # Popularity is a tie breaker, not the primary relevance signal.
    score += min(float(document.get("sold_count") or 0), 500) / 500 * 8
    score += min(float(document.get("rating") or 0), 5) / 5 * 4
    return round(score, 3)


def _sort_scored(scored: list[tuple[float, dict]], sort: str) -> list[tuple[float, dict]]:
    if sort == "price_low":
        return sorted(scored, key=lambda row: (float(row[1].get("discount_price") if row[1].get("discount_price") is not None else row[1].get("price") or 0), -row[0]))
    if sort == "price_high":
        return sorted(scored, key=lambda row: (-float(row[1].get("discount_price") if row[1].get("discount_price") is not None else row[1].get("price") or 0), -row[0]))
    if sort == "newest":
        return sorted(scored, key=lambda row: (str(row[1].get("created_at") or ""), row[0]), reverse=True)
    if sort == "rating":
        return sorted(scored, key=lambda row: (float(row[1].get("rating") or 0), row[0]), reverse=True)
    return sorted(scored, key=lambda row: (row[0], float(row[1].get("sold_count") or 0), float(row[1].get("rating") or 0)), reverse=True)


async def smart_product_search(base_query: dict, query: str, *, sort: str = "popular", skip: int = 0, limit: int = 40, candidate_limit: int = 700) -> tuple[int, list[dict], dict]:
    """Return ranked forgiving product search results.

    Exact/synonym candidates are read first, then a bounded fallback pool is used
    for typo tolerance. This is intentionally Mongo-only and dependency-light so
    it works now; a dedicated search service can replace it later without changing
    the API contract.
    """
    info = expand_query(query)
    clause = mongo_text_clause(query)
    candidates: list[dict] = []

    if clause:
        exact_query = {"$and": [base_query, clause]}
        candidates = await db.products.find(exact_query, {"_id": 0}).limit(candidate_limit).to_list(candidate_limit)

    seen = {p.get("id") for p in candidates}
    if len(candidates) < min(120, candidate_limit):
        fallback = await db.products.find(base_query, {"_id": 0}).sort([("sold_count", -1), ("rating", -1)]).limit(candidate_limit).to_list(candidate_limit)
        for product in fallback:
            if product.get("id") not in seen:
                candidates.append(product)
                seen.add(product.get("id"))

    scored = []
    for product in candidates:
        score = relevance_score(query, product)
        # 31 keeps meaningful fuzzy/alias results while rejecting unrelated stock.
        if score >= 31:
            scored.append((score, product))

    scored = _sort_scored(scored, sort)
    total = len(scored)
    items = []
    for score, product in scored[skip: skip + limit]:
        product = dict(product)
        product["search_score"] = score
        items.append(product)
    return total, items, info


async def smart_shop_search(query: str, *, category: str | None = None, featured: bool | None = None, limit: int = 40) -> list[dict]:
    """Match shops by their own identity OR by products they currently carry."""
    shop_base: dict = {"status": "published"}
    if category:
        shop_base["category"] = category
    if featured is not None:
        shop_base["is_featured"] = featured

    shops = await db.shops.find(shop_base, {"_id": 0}).limit(500).to_list(500)
    if not query.strip():
        shops.sort(key=lambda s: (float(s.get("rating") or 0), str(s.get("created_at") or "")), reverse=True)
        return shops[:limit]

    visible_ids = [s.get("id") for s in shops if s.get("id")]
    product_base = {"status": "published", "shop_id": {"$in": visible_ids}}
    if category:
        product_base["category"] = category
    _, matching_products, _ = await smart_product_search(product_base, query, limit=500, candidate_limit=900)

    products_by_shop: dict[str, list[dict]] = {}
    for p in matching_products:
        products_by_shop.setdefault(p.get("shop_id"), []).append(p)

    qnorm = normalize_text(query)
    ranked = []
    for shop in shops:
        own_text = normalize_text(f"{shop.get('name', '')} {shop.get('description', '')} {shop.get('category', '')} {shop.get('slug', '')}")
        own_ratio = SequenceMatcher(None, compact(qnorm), compact(own_text)).ratio() if own_text else 0
        own_match = qnorm in own_text or own_ratio >= 0.58
        carried = products_by_shop.get(shop.get("id"), [])
        if not own_match and not carried:
            continue
        row = dict(shop)
        row["matching_product_count"] = len(carried)
        row["matching_products"] = carried[:3]
        row["matched_by"] = "shop_and_products" if own_match and carried else "shop" if own_match else "products"
        row["product_count"] = await db.products.count_documents({"shop_id": shop["id"], "status": "published"})
        score = (90 if qnorm == normalize_text(shop.get("name")) else 55 if own_match else 0) + min(len(carried), 20) * 5 + float(shop.get("rating") or 0)
        ranked.append((score, row))

    ranked.sort(key=lambda row: row[0], reverse=True)
    return [row for _, row in ranked[:limit]]

"""Search UX API: unified suggestions + photo similarity search."""

from __future__ import annotations

import asyncio
from io import BytesIO
import ipaddress
import math
import socket
from urllib.parse import urljoin, urlparse

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
import numpy as np
import requests

from db import db
from search_engine import expand_query, normalize_text, smart_product_search, smart_shop_search
from storage import get_object

router = APIRouter()

MAX_IMAGE_BYTES = 8 * 1024 * 1024
REMOTE_IMAGE_BYTES = 5 * 1024 * 1024


def _name_score(query: str, value: str) -> float:
    q = normalize_text(query)
    v = normalize_text(value)
    if not q or not v:
        return 0
    if q == v:
        return 100
    if q in v:
        return 75
    q_tokens = set(q.split())
    v_tokens = set(v.split())
    overlap = len(q_tokens & v_tokens) / max(1, len(q_tokens))
    return overlap * 55


@router.get("/search/suggest")
async def suggest(q: str = Query(min_length=1, max_length=120), limit: int = Query(default=6, ge=1, le=12)):
    visible = await db.shops.distinct("id", {"status": "published"})
    base = {"status": "published", "shop_id": {"$in": visible}}
    _, products, info = await smart_product_search(base, q, limit=max(limit * 2, 10), candidate_limit=500)
    shops = await smart_shop_search(q, limit=limit)

    categories = await db.categories.find({}, {"_id": 0}).to_list(100)
    category_rows = []
    for cat in categories:
        score = max(_name_score(q, cat.get("name", "")), _name_score(info.get("canonical", ""), cat.get("name", "")))
        # Also use products found by the smart engine to surface their category.
        if any(p.get("category") == cat.get("slug") for p in products):
            score = max(score, 60)
        if score >= 25:
            row = dict(cat)
            row["search_score"] = score
            category_rows.append(row)
    category_rows.sort(key=lambda x: x.get("search_score", 0), reverse=True)

    brand_names = set(await db.products.distinct("brand", base))
    brand_names.update(p.get("brand") for p in products if p.get("brand"))
    brands = []
    for brand in brand_names:
        if not brand:
            continue
        score = max(_name_score(q, str(brand)), _name_score(info.get("canonical", ""), str(brand)))
        if score >= 25 or any(p.get("brand") == brand for p in products):
            brands.append({"name": brand, "search_score": max(score, 45)})
    brands.sort(key=lambda x: x["search_score"], reverse=True)

    # Search phrases are intentionally based on the normalized/canonical intent,
    # not static ads. They make "tshirt" -> "t shirt" discoverable to the user.
    phrase_seed = []
    for term in [info.get("canonical"), info.get("normalized"), *info.get("terms", [])]:
        term = normalize_text(term)
        if term and term not in phrase_seed and len(term) >= 2:
            phrase_seed.append(term)
    searches = phrase_seed[:6]

    return {
        "query": info,
        "products": products[:limit],
        "shops": shops[:limit],
        "brands": brands[:limit],
        "categories": category_rows[:limit],
        "searches": searches,
    }


def _validate_public_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValueError("Unsupported image URL")
    if parsed.username or parsed.password:
        raise ValueError("Credentials in image URLs are not allowed")
    if parsed.port and parsed.port not in (80, 443):
        raise ValueError("Unsupported image port")
    infos = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise ValueError("Private/local image URLs are not allowed")
    return url


def _fetch_remote_image(url: str) -> bytes:
    current = _validate_public_url(url)
    headers = {"User-Agent": "NexoraVisualSearch/1.0"}
    for _ in range(4):
        response = requests.get(current, headers=headers, timeout=(4, 8), stream=True, allow_redirects=False)
        if response.is_redirect or response.is_permanent_redirect:
            location = response.headers.get("Location")
            if not location:
                raise ValueError("Image redirect missing location")
            current = _validate_public_url(urljoin(current, location))
            continue
        response.raise_for_status()
        content_type = (response.headers.get("Content-Type") or "").lower()
        if "image/" not in content_type:
            raise ValueError("Product URL is not an image")
        chunks = []
        size = 0
        for chunk in response.iter_content(64 * 1024):
            if not chunk:
                continue
            size += len(chunk)
            if size > REMOTE_IMAGE_BYTES:
                raise ValueError("Product image is too large")
            chunks.append(chunk)
        return b"".join(chunks)
    raise ValueError("Too many image redirects")


def _product_image_bytes(src: str) -> bytes:
    if not src:
        raise ValueError("No image")
    if src.startswith("/api/files/"):
        path = src[len("/api/files/"):]
        data, _ = get_object(path)
        return data
    if src.startswith("api/files/"):
        path = src[len("api/files/"):]
        data, _ = get_object(path)
        return data
    if src.startswith(("http://", "https://")):
        return _fetch_remote_image(src)
    # Imported/local products may store the raw storage key instead of /api/files/.
    if "/uploads/" in src or src.startswith("nexora/"):
        data, _ = get_object(src.lstrip("/"))
        return data
    raise ValueError("Unsupported product image")


def _visual_signature(data: bytes) -> list[float]:
    try:
        from PIL import Image, ImageOps
    except Exception as exc:
        raise RuntimeError("Pillow is required for photo search") from exc

    image = Image.open(BytesIO(data))
    image = ImageOps.exif_transpose(image).convert("RGB")
    image.thumbnail((512, 512))

    # A low-resolution spatial signature keeps rough shape/layout information.
    spatial = image.resize((12, 12)).convert("RGB")
    arr = np.asarray(spatial, dtype=np.float32) / 255.0
    spatial_vec = arr.reshape(-1)

    # Histograms make matching more robust to cropping/position changes.
    full = np.asarray(image.resize((96, 96)), dtype=np.uint8)
    hist_parts = []
    for channel in range(3):
        hist, _ = np.histogram(full[:, :, channel], bins=16, range=(0, 256), density=False)
        hist = hist.astype(np.float32)
        hist /= max(1.0, float(hist.sum()))
        hist_parts.extend(hist.tolist())

    gray = np.asarray(image.convert("L").resize((17, 16)), dtype=np.float32)
    dhash = (gray[:, 1:] > gray[:, :-1]).astype(np.float32).reshape(-1)

    vector = np.concatenate([spatial_vec * 0.75, np.asarray(hist_parts, dtype=np.float32) * 2.2, dhash * 0.28])
    norm = float(np.linalg.norm(vector))
    if not math.isfinite(norm) or norm <= 0:
        raise ValueError("Could not analyze image")
    return (vector / norm).astype(np.float32).tolist()


def _cosine(a: list[float], b: list[float]) -> float:
    if len(a) != len(b) or not a:
        return 0.0
    av = np.asarray(a, dtype=np.float32)
    bv = np.asarray(b, dtype=np.float32)
    return float(np.dot(av, bv))


async def _signature_for_product(product: dict, semaphore: asyncio.Semaphore):
    src = (product.get("images") or [None])[0]
    if not src:
        return None
    cached = await db.visual_search_cache.find_one({"product_id": product.get("id"), "image": src}, {"_id": 0})
    if cached and cached.get("signature"):
        return product, cached["signature"]

    async with semaphore:
        try:
            data = await asyncio.to_thread(_product_image_bytes, src)
            signature = await asyncio.to_thread(_visual_signature, data)
            await db.visual_search_cache.update_one(
                {"product_id": product.get("id")},
                {"$set": {"product_id": product.get("id"), "image": src, "signature": signature}},
                upsert=True,
            )
            return product, signature
        except Exception:
            return None


@router.post("/search/image")
async def image_search(file: UploadFile = File(...), limit: int = Query(default=24, ge=1, le=40)):
    if not (file.content_type or "").lower().startswith("image/"):
        raise HTTPException(400, "Please upload an image file")
    raw = await file.read(MAX_IMAGE_BYTES + 1)
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Image must be at most 8 MB")
    if not raw:
        raise HTTPException(400, "Image is empty")

    try:
        query_signature = await asyncio.to_thread(_visual_signature, raw)
    except RuntimeError:
        raise HTTPException(503, "Photo search dependency is not installed yet. Run pip install -r requirements.txt")
    except Exception:
        raise HTTPException(400, "Could not read this image. Try JPG, PNG or WEBP")

    visible = await db.shops.distinct("id", {"status": "published"})
    products = await db.products.find(
        {"status": "published", "shop_id": {"$in": visible}, "images.0": {"$exists": True}},
        {"_id": 0},
    ).sort([("sold_count", -1), ("rating", -1)]).limit(240).to_list(240)

    semaphore = asyncio.Semaphore(10)
    rows = await asyncio.gather(*[_signature_for_product(product, semaphore) for product in products])
    scored = []
    for row in rows:
        if not row:
            continue
        product, signature = row
        similarity = _cosine(query_signature, signature)
        if similarity >= 0.48:
            item = dict(product)
            item["visual_similarity"] = round(similarity, 4)
            scored.append(item)
    scored.sort(key=lambda p: (p.get("visual_similarity", 0), p.get("sold_count", 0), p.get("rating", 0)), reverse=True)

    return {
        "items": scored[:limit],
        "total_compared": len([row for row in rows if row]),
        "note": "Visual similarity search compares product imagery; use text search for exact model/specification matching.",
    }

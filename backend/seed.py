import os
import random
from db import db, new_id, now_iso
from security import hash_password
from datetime import datetime, timezone, timedelta

random.seed(42)

IMG = {
    "fashion": [
        "https://images.unsplash.com/photo-1662532577856-e8ee8b138a8b?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.unsplash.com/photo-1603189343302-e603f7add05a?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.unsplash.com/flagged/photo-1570733117311-d990c3816c47?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.pexels.com/photos/20483654/pexels-photo-20483654.jpeg?auto=compress&cs=tinysrgb&w=800",
        "https://images.unsplash.com/photo-1613915617430-8ab0fd7c6baf?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.pexels.com/photos/17022653/pexels-photo-17022653.jpeg?auto=compress&cs=tinysrgb&w=800",
    ],
    "food": [
        "https://images.unsplash.com/photo-1534432182912-63863115e106?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.unsplash.com/photo-1643944471768-2d2eac3afb6d?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.unsplash.com/photo-1583338917451-face2751d8d5?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.unsplash.com/photo-1547398847-19d7560a6257?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
    ],
    "electronics": [
        "https://images.unsplash.com/photo-1609081219090-a6d81d3085bf?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.unsplash.com/photo-1546435770-a3e426bf472b?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
    ],
    "beauty": [
        "https://images.unsplash.com/photo-1552046122-03184de85e08?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.unsplash.com/photo-1580870069867-74c57ee1bb07?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.unsplash.com/photo-1583209814683-c023dd293cc6?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.unsplash.com/photo-1596462502278-27bfdc403348?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
    ],
    "furniture": [
        "https://images.unsplash.com/photo-1693578616322-c8abe6c7393d?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.unsplash.com/photo-1649511134921-67afc567280c?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.pexels.com/photos/5998030/pexels-photo-5998030.jpeg?auto=compress&cs=tinysrgb&w=800",
        "https://images.pexels.com/photos/11295890/pexels-photo-11295890.jpeg?auto=compress&cs=tinysrgb&w=800",
        "https://images.unsplash.com/photo-1616137422495-1e9e46e2aa77?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.unsplash.com/photo-1554995207-c18c203602cb?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
    ],
    "grocery": [
        "https://images.unsplash.com/photo-1488459716781-31db52582fe9?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.unsplash.com/photo-1542838132-92c53300491e?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.unsplash.com/photo-1597362925123-77861d3fbac7?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.unsplash.com/photo-1579113800032-c38bd7635818?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
    ],
    "jewellery": [
        "https://images.unsplash.com/photo-1722410180644-5955f83ec8b1?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.unsplash.com/photo-1601121141461-9d6647bca1ed?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.unsplash.com/photo-1722410180687-b05b50922362?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.pexels.com/photos/4889719/pexels-photo-4889719.jpeg?auto=compress&cs=tinysrgb&w=800",
        "https://images.unsplash.com/photo-1585960622850-ed33c41d6418?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.pexels.com/photos/32780784/pexels-photo-32780784.jpeg?auto=compress&cs=tinysrgb&w=800",
    ],
    "sports": [
        "https://images.unsplash.com/photo-1604563906225-598785ab66ca?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.unsplash.com/photo-1595909315417-2edd382a56dc?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.unsplash.com/photo-1605408499391-6368c628ef42?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.unsplash.com/photo-1591311630200-ffa9120a540f?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
    ],
    "books": [
        "https://images.unsplash.com/photo-1519682337058-a94d519337bc?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.unsplash.com/photo-1550399105-c4db5fb85c18?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
    ],
}
BANNERS = [
    "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600",
    "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600",
    "https://images.unsplash.com/photo-1483985988355-763728e1935b?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600",
    "https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600",
    "https://images.unsplash.com/photo-1441986300917-64674bd600d8?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600",
    "https://images.unsplash.com/photo-1472851294608-062f824d29cc?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600",
    "https://images.unsplash.com/photo-1519567241046-7f570eee3ce6?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600",
    "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600&sat=-40",
    "https://images.unsplash.com/photo-1481437156560-3205f6a55735?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600",
    "https://images.unsplash.com/photo-1445205170230-053b83016050?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600",
    "https://images.unsplash.com/photo-1556909212-d5b604d0c90d?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600",
    "https://images.unsplash.com/photo-1530731141654-5993c3016c77?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600",
    "https://images.unsplash.com/photo-1513708927688-890fe41c2748?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600",
]

CATEGORIES = [
    {"slug": "fashion", "name": "Fashion", "theme": "fashion_editorial", "icon": "shirt"},
    {"slug": "food", "name": "Cakes & Bakery", "theme": "cake_bakery_food", "icon": "cake"},
    {"slug": "electronics", "name": "Electronics", "theme": "electronics_technical", "icon": "smartphone"},
    {"slug": "beauty", "name": "Beauty", "theme": "beauty_elegant", "icon": "sparkles"},
    {"slug": "furniture", "name": "Furniture & Home", "theme": "furniture_home", "icon": "sofa"},
    {"slug": "grocery", "name": "Grocery", "theme": "grocery_fresh", "icon": "carrot"},
    {"slug": "jewellery", "name": "Jewellery", "theme": "jewellery_luxury", "icon": "gem"},
    {"slug": "sports", "name": "Sports", "theme": "sports_energetic", "icon": "dumbbell"},
    {"slug": "books", "name": "Books", "theme": "books_editorial", "icon": "book-open"},
]

# shops: (slug, name, category, description, brand, plan, product_names)
SHOPS = [
    ("dhaka-threads", "Dhaka Threads", "fashion", "Contemporary Bangladeshi fashion with an editorial edge.", "Dhaka Threads", "grow",
     ["Panjabi Classic Cotton", "Embroidered Kurti", "Linen Summer Shirt", "Handloom Saree", "Denim Jacket", "Silk Scarf", "Tailored Blazer", "Palazzo Set"]),
    ("nakshi-couture", "Nakshi Couture", "fashion", "Heritage-inspired couture and modern silhouettes.", "Nakshi", "pro",
     ["Jamdani Saree", "Nakshi Kantha Shawl", "Festive Lehenga", "Cotton Fatua", "Designer Anarkali", "Block Print Dupatta", "Party Gown"]),
    ("sweet-symphony", "Sweet Symphony", "food", "Artisanal cakes and pastries baked fresh daily in Dhaka.", "Sweet Symphony", "grow",
     ["Chocolate Truffle Cake", "Red Velvet Slice", "French Macarons Box", "Vanilla Cupcakes", "Cheesecake Jar", "Fruit Tart", "Brownie Box", "Cinnamon Rolls"]),
    ("crumb-co", "Crumb & Co.", "food", "Small-batch celebration cakes and dessert boxes.", "Crumb & Co.", "start",
     ["Birthday Fondant Cake", "Tiramisu Cup", "Chocolate Fudge Jar", "Assorted Donuts", "Lemon Loaf", "Pistachio Cake"]),
    ("voltix", "Voltix Electronics", "electronics", "Premium audio, wearables and smart gadgets.", "Voltix", "grow",
     ["Wireless ANC Headphones", "TWS Earbuds Pro", "Smart Watch Series 7", "Bluetooth Speaker", "Portable Charger 20K", "Mechanical Keyboard", "USB-C Hub", "Wireless Mouse"]),
    ("techbari", "TechBari", "electronics", "Everyday tech essentials at honest prices.", "TechBari", "start",
     ["Fast Charger 65W", "Laptop Stand", "Webcam 1080p", "Gaming Headset", "Power Strip Smart", "Cable Organizer"]),
    ("glow-lab", "Glow Lab", "beauty", "Clean, effective skincare formulated for South Asian skin.", "Glow Lab", "grow",
     ["Vitamin C Serum", "Hydrating Moisturizer", "Gentle Foaming Cleanser", "SPF 50 Sunscreen", "Niacinamide Toner", "Sheet Mask Set", "Lip Care Balm", "Under Eye Cream"]),
    ("rupasi", "Rupasi Beauty", "beauty", "Elegant makeup and beauty rituals.", "Rupasi", "start",
     ["Matte Liquid Lipstick", "Kajal Intense", "Foundation Stick", "Blush Palette", "Makeup Brush Set", "Setting Spray"]),
    ("nestwell", "Nestwell Home", "furniture", "Interior-grade furniture and decor for modern homes.", "Nestwell", "pro",
     ["Accent Lounge Chair", "Solid Wood Coffee Table", "3-Seater Fabric Sofa", "Floor Lamp Minimal", "Bookshelf Oak", "Ceramic Vase Set", "Wall Art Framed", "Cotton Throw Pillow"]),
    ("shobji-bazar", "Shobji Bazar", "grocery", "Farm-fresh vegetables, fruits and daily essentials.", "Shobji Bazar", "start",
     ["Fresh Tomatoes 1kg", "Organic Spinach Bundle", "Seasonal Fruit Basket", "Basmati Rice 5kg", "Free-Range Eggs 12pc", "Cold-Pressed Mustard Oil", "Mixed Vegetable Pack", "Fresh Bananas Dozen"]),
    ("shorna-jewellers", "Shorna Jewellers", "jewellery", "Timeless gold and traditional Bangladeshi jewellery.", "Shorna", "pro",
     ["22K Gold Necklace Set", "Kundan Earrings", "Bridal Choker", "Gold Bangles Pair", "Pendant Locket", "Nose Pin Classic", "Temple Jewellery Set"]),
    ("velocity-sports", "Velocity Sports", "sports", "Performance gear for athletes and everyday movers.", "Velocity", "grow",
     ["Running Shoes Pro", "Training Shorts", "Skipping Rope Speed", "Yoga Mat Premium", "Dumbbell Set 10kg", "Sports Water Bottle", "Compression Tee", "Gym Duffel Bag"]),
    ("boierpata", "Boier Pata", "books", "Curated Bangla and English literature for every reader.", "Boier Pata", "start",
     ["Feluda Collection", "Modern Poetry Anthology", "Bestseller Novel Set", "Children Picture Book", "Self-Help Guide", "Historical Fiction", "Cookbook Deshi"]),
]

DEMO_USERS = [
    ("customer@nexora.com", "customer123", "Ayesha Rahman", "customer"),
    ("seller@nexora.com", "seller123", "Karim Hossain", "seller"),
]

REVIEW_TEXTS = [
    ("Rahim A.", 5, "Excellent quality, exactly as described. Fast delivery in Dhaka!"),
    ("Fatima K.", 4, "Really happy with this purchase. Would buy again."),
    ("Tanvir H.", 5, "Premium feel and great value for money."),
    ("Nusrat J.", 4, "Good product, packaging could be better but overall satisfied."),
    ("Sabbir R.", 5, "Highly recommend this shop. Authentic and reliable."),
]


async def _ensure_users():
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_pw = os.environ["ADMIN_PASSWORD"]
    if not await db.users.find_one({"email": admin_email}):
        await db.users.insert_one({
            "id": new_id("user_"), "email": admin_email, "name": "NEXORA Admin",
            "password_hash": hash_password(admin_pw), "role": "admin", "picture": None,
            "auth_provider": "password", "created_at": now_iso(),
        })
    for email, pw, name, role in DEMO_USERS:
        if not await db.users.find_one({"email": email}):
            await db.users.insert_one({
                "id": new_id("user_"), "email": email, "name": name,
                "password_hash": hash_password(pw), "role": role, "picture": None,
                "auth_provider": "password", "created_at": now_iso(),
            })


async def seed():
    for category in CATEGORIES:
        await db.categories.update_one({"slug": category["slug"]}, {"$setOnInsert": dict(category)}, upsert=True)
    if os.environ.get("SEED_DEMO_DATA", "false").lower() != "true":
        return
    await _ensure_users()

    if await db.shops.count_documents({}) > 0:
        return

    seller_demo = await db.users.find_one({"email": "seller@nexora.com"})
    cat_theme = {c["slug"]: c["theme"] for c in CATEGORIES}
    now = datetime.now(timezone.utc)
    cat_offset = {}

    for idx, (slug, name, cat, desc, brand, plan, product_names) in enumerate(SHOPS):
        off = cat_offset.get(cat, 0)
        cat_offset[cat] = off + 1
        # attach the demo seller to the first shop so login shows a real store
        if idx == 0:
            seller_id = seller_demo["id"]
        else:
            email = f"{slug}@nexora-sellers.com"
            existing = await db.users.find_one({"email": email})
            if existing:
                seller_id = existing["id"]
            else:
                u = {
                    "id": new_id("user_"), "email": email, "name": f"{name} Owner",
                    "password_hash": hash_password("seller123"), "role": "seller", "picture": None,
                    "auth_provider": "password", "created_at": now_iso(),
                }
                await db.users.insert_one(dict(u))
                seller_id = u["id"]

        await db.seller_profiles.update_one(
            {"user_id": seller_id},
            {"$set": {"business_name": name, "category": cat, "onboarding_complete": True},
             "$setOnInsert": {"id": new_id("sp_"), "user_id": seller_id, "created_at": now_iso()}},
            upsert=True,
        )
        await db.subscriptions.update_one(
            {"seller_id": seller_id},
            {"$set": {"plan": plan, "status": "active_dev"},
             "$setOnInsert": {"id": new_id("sub_"), "seller_id": seller_id, "started_at": now_iso()}},
            upsert=True,
        )

        imgs = IMG[cat]
        shop_id = new_id("shop_")
        rating = round(random.uniform(4.2, 4.9), 1)
        banner = BANNERS[idx % len(BANNERS)]
        hero = imgs[off % len(imgs)]
        shop = {
            "id": shop_id, "seller_id": seller_id, "name": name, "slug": slug, "category": cat,
            "theme_preset": cat_theme[cat], "description": desc,
            "logo": None, "banner": banner, "hero_image": hero,
            "hero_heading": name, "hero_subheading": desc, "hero_cta": "Shop Collection",
            "accent_color": None, "secondary_color": None, "typography_preset": "default",
            "featured_product_ids": [], "collections": [
                {"id": new_id("col_"), "name": "New Season", "product_ids": []},
                {"id": new_id("col_"), "name": "Bestsellers", "product_ids": []},
            ],
            "sections": ["hero", "featured", "collections", "products", "about", "reviews"],
            "about": f"{name} is a proud NEXORA merchant delivering across Bangladesh. {desc}",
            "social_links": {"facebook": "https://facebook.com", "instagram": "https://instagram.com"},
            "contact": {"phone": "+880 1700-000000", "email": f"hello@{slug}.com"},
            "policies": {"shipping": "Delivery within 2-4 working days across Bangladesh.", "returns": "7-day easy returns on eligible items."},
            "rating": rating, "is_featured": idx < 8, "status": "published", "created_at": now_iso(),
        }

        product_ids = []
        for pi, pname in enumerate(product_names):
            base = random.choice([490, 690, 890, 1290, 1990, 2490, 3990, 5990, 8990, 12990])
            has_discount = random.random() < 0.55
            price = float(base)
            discount = round(price * random.uniform(0.7, 0.9)) if has_discount else None
            stock = random.choice([0, 3, 4, 8, 15, 30, 45, 60])
            img = imgs[(pi + off) % len(imgs)]
            variants = []
            if cat in ("fashion", "sports"):
                variants = [{"name": "Size", "options": ["S", "M", "L", "XL"]}, {"name": "Color", "options": ["Black", "White", "Emerald"]}]
            elif cat in ("food",):
                variants = [{"name": "Size", "options": ["0.5 kg", "1 kg", "2 kg"]}]
            elif cat in ("electronics",):
                variants = [{"name": "Color", "options": ["Black", "Silver"]}]
            pid = new_id("prod_")
            product_ids.append(pid)
            rc = random.randint(8, 240)
            prod = {
                "id": pid, "shop_id": shop_id, "shop_name": name, "shop_slug": slug, "seller_id": seller_id,
                "title": pname, "description": f"{pname} from {name}. Crafted with premium materials and quality-checked before dispatch. A NEXORA verified listing.",
                "category": cat, "brand": brand, "sku": f"{slug[:3].upper()}-{1000+pi}",
                "price": price if not discount else price, "discount_price": float(discount) if discount else None,
                "images": [img, imgs[(pi + off + 1) % len(imgs)]],
                "variants": variants,
                "attributes": [{"name": "Material", "value": "Premium"}, {"name": "Origin", "value": "Bangladesh"}],
                "stock": stock, "status": "published",
                "tags": [cat, brand.lower(), pname.split()[0].lower()],
                "specs": {"Brand": brand, "Warranty": "7-day replacement", "Shipping": "Nationwide"},
                "rating": round(random.uniform(4.0, 5.0), 1), "review_count": rc,
                "sold_count": random.randint(5, 800),
                "is_featured": pi < 4,
                "created_at": (now - timedelta(days=random.randint(0, 60))).isoformat(),
            }
            await db.products.insert_one(dict(prod))

            for name_r, rr, txt in random.sample(REVIEW_TEXTS, k=random.randint(1, 3)):
                await db.reviews.insert_one({
                    "id": new_id("rev_"), "product_id": pid, "shop_id": shop_id,
                    "user_id": "seed", "user_name": name_r, "rating": rr, "comment": txt,
                    "created_at": (now - timedelta(days=random.randint(0, 30))).isoformat(),
                })

        shop["featured_product_ids"] = product_ids[:4]
        shop["collections"][0]["product_ids"] = product_ids[:4]
        shop["collections"][1]["product_ids"] = product_ids[4:8]
        await db.shops.insert_one(dict(shop))


async def ensure_indexes():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.shops.create_index("slug", unique=True)
    await db.shops.create_index("seller_id")
    await db.products.create_index("shop_id")
    await db.products.create_index("category")

    await db.checkouts.create_index([("customer_id", 1), ("key", 1)], unique=True)
    await db.orders.create_index("id", unique=True)
    await db.wallets.create_index([("user_id", 1), ("mode", 1)], unique=True)
    await db.wallet_deposits.create_index("id", unique=True)
    await db.wallet_deposits.create_index([("user_id", 1), ("mode", 1), ("key", 1)], unique=True)
    await db.wallet_ledger.create_index("reference", unique=True)
    await db.wallet_ledger.create_index("validation_id", unique=True, sparse=True)
    await db.audit_events.create_index([("created_at", -1)])
    await db.shop_follows.create_index([("customer_id", 1), ("shop_id", 1)], unique=True)
    await db.shop_follows.create_index([("customer_id", 1), ("created_at", -1)])
    await db.seller_dashboard_themes.create_index("plan_id", unique=True)

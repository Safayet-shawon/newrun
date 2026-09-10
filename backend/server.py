import os
import logging
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from db import db
import auth
import catalog
import smart_search
import seller
import commerce
import orders
import wallet
import admin
import subscription_tokens
import owner_admin
import seller_intelligence_v2
import store_importer
import universal_store_scanner
import browser_store_scanner
import deep_store_scanner
import deep_catalog_scanner
import catalogue_scan_gateway
import social_store_scanner_v2
import import_ai_v2
import seed as seed_module
import storage

subscription_tokens.install_seller_expiry_guard(seller)

# Auto-sync and manual scans use the deep multi-page scanner. The gateway owns
# the public /scan endpoint and sends Facebook links directly to assisted mode.
store_importer.scan_store_sync = deep_catalog_scanner.deep_scan_sync
browser_store_scanner.composite_scan_sync = deep_catalog_scanner.deep_scan_sync

app = FastAPI(title="NEXORA API")

app.include_router(auth.router, prefix="/api")
app.include_router(catalog.router, prefix="/api")
app.include_router(smart_search.router, prefix="/api")
app.include_router(seller.router, prefix="/api")
app.include_router(commerce.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(wallet.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(subscription_tokens.router, prefix="/api")
app.include_router(owner_admin.router, prefix="/api")
app.include_router(seller_intelligence_v2.router, prefix="/api")

# Route order is intentional.
app.include_router(catalogue_scan_gateway.router, prefix="/api")
app.include_router(social_store_scanner_v2.router, prefix="/api")
app.include_router(browser_store_scanner.router, prefix="/api")
app.include_router(import_ai_v2.router, prefix="/api")
app.include_router(store_importer.router, prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=os.environ.get(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("nexora")


@app.get("/api/")
async def root():
    return {"message": "NEXORA API online"}


@app.on_event("startup")
async def startup():
    try:
        await seed_module.ensure_indexes()
        await subscription_tokens.ensure_indexes()
        await store_importer.ensure_indexes()
        await import_ai_v2.ensure_import_categories()
    except Exception as e:
        logger.error(f"Index/category setup: {e}")

    try:
        await seed_module.seed()
        logger.info("Seed complete")
    except Exception as e:
        logger.error(f"Seed failed: {e}")

    try:
        storage.init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")

    try:
        import playwright  # noqa: F401
        logger.info("Browser import package detected")
    except Exception:
        logger.warning(
            "Browser import package missing. Run backend/install_browser_import.ps1 "
            "or install requirements + Playwright Chromium before browser-assisted imports."
        )

    try:
        store_importer.start_sync_worker()
        logger.info("Store import sync worker started")
    except Exception as e:
        logger.error(f"Store import sync worker failed to start: {e}")


@app.on_event("shutdown")
async def shutdown():
    try:
        await browser_store_scanner.close_all_manual_sessions()
        await store_importer.stop_sync_worker()
    finally:
        from db import client
        client.close()

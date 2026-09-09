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
import seller
import commerce
import orders
import wallet
import admin
import subscription_tokens
import owner_admin
import seller_intelligence
import store_importer
import universal_store_scanner
import seed as seed_module
import storage

subscription_tokens.install_seller_expiry_guard(seller)

# Upgrade the existing PRO import routes and sync worker to the multi-layer
# universal public-store scanner without changing their API contract.
store_importer.scan_store_sync = universal_store_scanner.scan_store_sync

app = FastAPI(title="NEXORA API")

app.include_router(auth.router, prefix="/api")
app.include_router(catalog.router, prefix="/api")
app.include_router(seller.router, prefix="/api")
app.include_router(commerce.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(wallet.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(subscription_tokens.router, prefix="/api")
app.include_router(owner_admin.router, prefix="/api")
app.include_router(seller_intelligence.router, prefix="/api")
app.include_router(store_importer.router, prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
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
    except Exception as e:
        logger.error(f"Index setup: {e}")
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
        store_importer.start_sync_worker()
        logger.info("Store import sync worker started")
    except Exception as e:
        logger.error(f"Store import sync worker failed to start: {e}")


@app.on_event("shutdown")
async def shutdown():
    try:
        await store_importer.stop_sync_worker()
    finally:
        from db import client
        client.close()

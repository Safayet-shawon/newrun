import os
import logging
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from db import db
import auth
import catalog
import smart_search
import seller
import seller_global
import commerce
import orders
import wallet
import admin
import admin_control
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
import global_core
import rate_limit
import seed as seed_module
import storage

subscription_tokens.install_seller_expiry_guard(seller)

store_importer.scan_store_sync = deep_catalog_scanner.deep_scan_sync
browser_store_scanner.composite_scan_sync = deep_catalog_scanner.deep_scan_sync

app = FastAPI(title="NEXORA API", version="1.0.0")

app.include_router(auth.router, prefix="/api")
app.include_router(catalog.router, prefix="/api")
app.include_router(smart_search.router, prefix="/api")
app.include_router(seller.router, prefix="/api")
app.include_router(seller_global.router, prefix="/api")
app.include_router(commerce.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(wallet.router, prefix="/api")
app.include_router(global_core.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(admin_control.router, prefix="/api")
app.include_router(subscription_tokens.router, prefix="/api")
app.include_router(owner_admin.router, prefix="/api")
app.include_router(seller_intelligence_v2.router, prefix="/api")

# Route order is intentional.
app.include_router(catalogue_scan_gateway.router, prefix="/api")
app.include_router(social_store_scanner_v2.router, prefix="/api")
app.include_router(browser_store_scanner.router, prefix="/api")
app.include_router(import_ai_v2.router, prefix="/api")
app.include_router(store_importer.router, prefix="/api")

allowed_origins = [x.strip() for x in os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
).split(",") if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

if os.getenv("APP_ENV", "development").lower() == "production":
    allowed_hosts = [x.strip() for x in os.getenv("ALLOWED_HOSTS", "").split(",") if x.strip()]
    if allowed_hosts:
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("nexora")


def _worker_enabled() -> bool:
    default = "false" if os.getenv("APP_ENV", "development").lower() == "production" else "true"
    return os.getenv("RUN_IMPORT_SYNC_WORKER", default).lower() in {"1", "true", "yes", "on"}


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(self), microphone=(), geolocation=()")
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    if os.getenv("APP_ENV", "development").lower() == "production":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


@app.get("/api/")
async def root():
    return {"message": "NEXORA API online"}


@app.get("/api/health/live")
async def health_live():
    return {"status": "ok"}


@app.get("/api/health/ready")
async def health_ready():
    checks = {}
    try:
        await db.command("ping")
        checks["database"] = True
    except Exception:
        checks["database"] = False

    production = os.getenv("APP_ENV", "development").lower() == "production"
    if production:
        checks["https_frontend"] = os.getenv("FRONTEND_URL", "").startswith("https://")
        checks["durable_storage"] = os.getenv("STORAGE_BACKEND", "local").lower() != "local"
        checks["demo_seed_disabled"] = os.getenv("SEED_DEMO_DATA", "false").lower() not in {"1", "true", "yes", "on"}
        checks["dev_subscriptions_disabled"] = os.getenv("ALLOW_DEV_SUBSCRIPTIONS", "false").lower() not in {"1", "true", "yes", "on"}
        checks["jwt_secret"] = len(os.getenv("JWT_SECRET", "")) >= 32
    ok = all(checks.values()) if checks else True
    if not ok:
        return JSONResponse({"status": "not_ready", "checks": checks}, status_code=503)
    return {"status": "ready", "checks": checks}


@app.on_event("startup")
async def startup():
    try:
        await seed_module.ensure_indexes()
        await subscription_tokens.ensure_indexes()
        await store_importer.ensure_indexes()
        await import_ai_v2.ensure_import_categories()
        await admin_control.ensure_indexes()
        await auth.ensure_auth_indexes()
        await rate_limit.ensure_rate_limit_indexes()
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

    if _worker_enabled():
        try:
            store_importer.start_sync_worker()
            logger.info("Store import sync worker started inside API process")
        except Exception as e:
            logger.error(f"Store import sync worker failed to start: {e}")
    else:
        logger.info("Store import sync worker disabled in API process")


@app.on_event("shutdown")
async def shutdown():
    try:
        await browser_store_scanner.close_all_manual_sessions()
        if _worker_enabled():
            await store_importer.stop_sync_worker()
    finally:
        from db import client
        client.close()

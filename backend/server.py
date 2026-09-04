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
import seed as seed_module
import storage

app = FastAPI(title="NEXORA API")

app.include_router(auth.router, prefix="/api")
app.include_router(catalog.router, prefix="/api")
app.include_router(seller.router, prefix="/api")
app.include_router(commerce.router, prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=["*"],
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


@app.on_event("shutdown")
async def shutdown():
    from db import client
    client.close()

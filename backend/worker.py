import asyncio
import logging

from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import deep_catalog_scanner
import store_importer

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("nexora.worker")

store_importer.scan_store_sync = deep_catalog_scanner.deep_scan_sync


async def main():
    await store_importer.ensure_indexes()
    store_importer.start_sync_worker()
    logger.info("Nexora import sync worker running")
    stop = asyncio.Event()
    try:
        await stop.wait()
    finally:
        await store_importer.stop_sync_worker()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass

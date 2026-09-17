import asyncio
import logging

from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import deep_catalog_scanner
import store_importer
import connector_execution
import production_ops

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("nexora.worker")

store_importer.scan_store_sync = deep_catalog_scanner.deep_scan_sync


async def main():
    await store_importer.ensure_indexes()
    await production_ops.ensure_indexes()
    store_importer.start_sync_worker()
    connector_task = asyncio.create_task(connector_execution.worker_loop())
    courier_task = asyncio.create_task(production_ops.worker_loop())
    logger.info("Nexora background workers running: store sync, connector sync, courier tracking")
    stop = asyncio.Event()
    try:
        await stop.wait()
    finally:
        for task in (connector_task, courier_task):
            task.cancel()
        for task in (connector_task, courier_task):
            try:
                await task
            except asyncio.CancelledError:
                pass
        await store_importer.stop_sync_worker()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass

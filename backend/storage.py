import os
import requests
from pathlib import Path

LOCAL_ROOT = Path(__file__).resolve().parent.parent / ".local" / "uploads"
LOCAL_STORAGE = os.environ.get("STORAGE_BACKEND", "local") == "local"

def local_path(path):
    resolved = (LOCAL_ROOT / path).resolve()
    if not resolved.is_relative_to(LOCAL_ROOT.resolve()):
        raise ValueError("Invalid storage path")
    return resolved

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "nexora"

_storage_key = None


def init_storage(force: bool = False):
    global _storage_key
    if LOCAL_STORAGE:
        LOCAL_ROOT.mkdir(parents=True, exist_ok=True)
        return "local"
    if _storage_key and not force:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    if LOCAL_STORAGE:
        destination = local_path(path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        return {"path": path}
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    if LOCAL_STORAGE:
        source = local_path(path)
        return source.read_bytes(), MIME_TYPES.get(source.suffix.lstrip("."), "application/octet-stream")
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp",
}

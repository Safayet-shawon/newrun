import os
from pathlib import Path

import boto3
import requests
from botocore.config import Config

LOCAL_ROOT = Path(__file__).resolve().parent.parent / ".local" / "uploads"
STORAGE_BACKEND = os.environ.get("STORAGE_BACKEND", "local").strip().lower()
LOCAL_STORAGE = STORAGE_BACKEND == "local"
S3_STORAGE = STORAGE_BACKEND == "s3"


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
_s3_client = None


def _s3():
    global _s3_client
    if _s3_client is not None:
        return _s3_client
    region = os.getenv("S3_REGION", "us-east-1")
    kwargs = {
        "service_name": "s3",
        "region_name": region,
        "config": Config(signature_version="s3v4", retries={"max_attempts": 4, "mode": "standard"}),
    }
    endpoint = os.getenv("S3_ENDPOINT_URL", "").strip()
    if endpoint:
        kwargs["endpoint_url"] = endpoint
    if os.getenv("S3_ACCESS_KEY_ID"):
        kwargs["aws_access_key_id"] = os.environ["S3_ACCESS_KEY_ID"]
        kwargs["aws_secret_access_key"] = os.environ.get("S3_SECRET_ACCESS_KEY", "")
    _s3_client = boto3.client(**kwargs)
    return _s3_client


def _bucket():
    bucket = os.getenv("S3_BUCKET", "").strip()
    if not bucket:
        raise RuntimeError("S3_BUCKET is required when STORAGE_BACKEND=s3")
    return bucket


def init_storage(force: bool = False):
    global _storage_key
    if LOCAL_STORAGE:
        LOCAL_ROOT.mkdir(parents=True, exist_ok=True)
        return "local"
    if S3_STORAGE:
        client = _s3()
        client.head_bucket(Bucket=_bucket())
        return "s3"
    if _storage_key and not force:
        return _storage_key
    if not EMERGENT_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY is required for the emergent storage backend")
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
    if S3_STORAGE:
        _s3().put_object(
            Bucket=_bucket(),
            Key=path,
            Body=data,
            ContentType=content_type,
            CacheControl="public, max-age=31536000, immutable",
            ServerSideEncryption=os.getenv("S3_SERVER_SIDE_ENCRYPTION", "AES256"),
        )
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
    if S3_STORAGE:
        response = _s3().get_object(Bucket=_bucket(), Key=path)
        content = response["Body"].read()
        return content, response.get("ContentType") or "application/octet-stream"
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


MIME_TYPES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
}

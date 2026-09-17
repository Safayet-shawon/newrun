"""Unified catalogue scan entrypoint.

Facebook links are sent straight to seller-assisted browser flow instead of being
fetched as ordinary public websites. Other websites use the deep multi-page scan.
"""
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from security import require_role
import store_importer
import browser_store_scanner
import deep_catalog_scanner
from rate_limit import check_rate_limit

router = APIRouter()
seller_dep = require_role("seller")


class ScanBody(BaseModel):
    url: str = Field(min_length=4, max_length=500)
    confirm_rights: bool = False


def _normalize(raw):
    value = (raw or '').strip()
    if not value.startswith(('http://', 'https://')):
        value = 'https://' + value
    return value


def _is_facebook(url):
    try:
        host = (urlparse(url).hostname or '').lower()
    except Exception:
        return False
    return host == 'facebook.com' or host.endswith('.facebook.com')


@router.post('/seller/import-store/scan')
async def scan_catalogue(body: ScanBody, request: Request, user: dict = Depends(seller_dep)):
    await check_rate_limit(request, action="catalogue-scan", limit=12, window_seconds=3600, identity=user["id"])
    await store_importer._require_import(user)
    if not body.confirm_rights:
        raise HTTPException(422, 'Confirm that you own this website/page or have permission to import its catalogue')

    url = _normalize(body.url)
    if _is_facebook(url):
        result = {
            'website_url': url,
            'platform': 'facebook-page',
            'products': [],
            'manual_required': True,
            'challenge_type': 'facebook_login',
            'manual_message': (
                'Facebook pages use browser-assisted import. Open the assisted browser, complete Facebook login/verification yourself if requested, '
                'open the Page posts/photos/shop area, let products load, then click Continue scan in Nexora.'
            ),
            'browser_assist_available': True,
            'scan_report': [
                {'stage':'Facebook source','status':'ok','detail':'Facebook Page detected. Public HTTP scraping was skipped to avoid the HTTP 400/login wall.'},
                {'stage':'Assisted browser','status':'waiting','detail':'Seller login/verification may be required before visible Page posts can be analyzed.'},
            ],
        }
        return await browser_store_scanner._persist_scan_result(user['id'], result)

    result = await __import__('asyncio').to_thread(deep_catalog_scanner.deep_scan_sync, url)
    return await browser_store_scanner._persist_scan_result(user['id'], result)

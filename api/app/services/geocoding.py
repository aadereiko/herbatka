import asyncio
import time
from dataclasses import dataclass
from decimal import Decimal

import httpx

from app.core.config import get_settings

settings = get_settings()


@dataclass(frozen=True)
class Point:
    latitude: Decimal
    longitude: Decimal
    label: str


class GeocodingUnavailable(Exception):
    """The service could not be reached. Distinct from "no such address"."""


class AddressNotFound(Exception):
    pass


# Nominatim's usage policy is not advisory: at most one request a second from a single
# source, a User-Agent that identifies the application, and no bulk geocoding. Breaching
# it gets the IP blocked, so the limit is enforced here rather than trusted to callers.
_MIN_INTERVAL_SECONDS = 1.0
_lock = asyncio.Lock()
_last_call = 0.0


async def _throttle() -> None:
    global _last_call
    async with _lock:
        wait = _MIN_INTERVAL_SECONDS - (time.monotonic() - _last_call)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_call = time.monotonic()


def _query_from(address: str | None, city: str | None, country: str | None) -> str:
    return ", ".join(part for part in (address, city, country) if part)


async def lookup(address: str | None, city: str | None, country: str | None) -> Point:
    """Turn a written address into a point, or say why it could not.

    Geocoding is a guess, not a fact — "Rynek 7" resolves to a different square in every
    Polish town. The caller is expected to let a human correct the pin afterwards, which
    is why a bad result is a visible one rather than something silently stored.
    """
    query = _query_from(address, city, country)
    if not query:
        raise AddressNotFound("no address to look up")

    if not settings.geocoding_enabled:
        # Off by default under test, so the suite never depends on a third party being
        # up, on the network existing, or on someone else's rate limit.
        raise GeocodingUnavailable("geocoding is disabled")

    await _throttle()

    try:
        async with httpx.AsyncClient(timeout=settings.geocoding_timeout_seconds) as client:
            response = await client.get(
                f"{settings.geocoding_base_url}/search",
                params={"q": query, "format": "jsonv2", "limit": 1},
                headers={"User-Agent": settings.geocoding_user_agent},
            )
            response.raise_for_status()
            results = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise GeocodingUnavailable(str(exc)) from exc

    if not results:
        raise AddressNotFound(query)

    hit = results[0]
    return Point(
        latitude=Decimal(str(hit["lat"])).quantize(Decimal("0.000001")),
        longitude=Decimal(str(hit["lon"])).quantize(Decimal("0.000001")),
        label=hit.get("display_name", query),
    )

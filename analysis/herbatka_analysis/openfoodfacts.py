"""Open Food Facts lookups, for checking a recipe against a real package.

**Read `data/README.md` before reaching for this.** It was written to bulk-fill the
catalogue, the yield was measured, and it lost to the hand-written seed data. It survives as
a *verification* tool — "does Twinings actually put cornflower in Lady Grey?" — which is a
question it answers well.

Licensing: Open Food Facts data is ODbL, and the facts within it are DbCL. Both allow
commercial and non-commercial use with attribution, and share-alike on improvements *to the
database*. Recording that a package lists orange peel is a fact, and facts are not
copyrightable; copying a vendor's marketing prose into `description` would be a different
matter, and this module deliberately does not fetch it.

Their API asks for a User-Agent identifying the application and a modest request rate. Both
are honoured below, in the same spirit as `api/app/services/geocoding.py` with Nominatim.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

USER_AGENT = "Herbatka/0.1 (tea tracker; https://github.com/local/herbatka)"
BASE = "https://world.openfoodfacts.org/api/v2/product"
FIELDS = "product_name,brands,ingredients_text_en,ingredients_text,categories_tags"

#: Their guidance is a modest rate on the product endpoint. One request a second is well
#: inside it and keeps a 30-barcode sweep under a minute.
DELAY_SECONDS = 1.0


@dataclass(frozen=True)
class Product:
    code: str
    name: str
    brands: str
    ingredients_text: str
    language: str  # "en" when ingredients_text_en was present, else "unknown"


def fetch(code: str, timeout: float = 25.0) -> Product | None:
    """One product by barcode, or None if it is missing or has no ingredient text.

    Returns None rather than raising on a miss: in a sweep of thirty barcodes several will
    be absent, and that is an expected outcome rather than an error.
    """
    req = urllib.request.Request(
        f"{BASE}/{code}?fields={FIELDS}", headers={"User-Agent": USER_AGENT}
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            payload = json.load(response)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None

    if payload.get("status") != 1:
        return None

    product = payload["product"]
    english = (product.get("ingredients_text_en") or "").strip()
    any_language = (product.get("ingredients_text") or "").strip()
    text = english or any_language
    if not text:
        return None

    return Product(
        code=code,
        name=product.get("product_name", ""),
        brands=product.get("brands", ""),
        ingredients_text=text,
        language="en" if english else "unknown",
    )


def fetch_many(codes: list[str]) -> list[Product]:
    """Sweep a list of barcodes, politely. Missing products are simply absent from the result."""
    found = []
    for index, code in enumerate(codes):
        if index:
            time.sleep(DELAY_SECONDS)
        product = fetch(code)
        if product is not None:
            found.append(product)
    return found

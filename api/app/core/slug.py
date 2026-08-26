import re
import unicodedata

_NON_ALPHANUMERIC = re.compile(r"[^a-z0-9]+")


def slugify(value: str) -> str:
    """Turn a display name into a URL-safe slug.

    NFKD normalisation first, so "Sencha Fukamushi" and accented or Polish names
    ("Mięta") decompose to ASCII rather than being stripped to nothing.
    """
    normalised = unicodedata.normalize("NFKD", value)
    ascii_only = normalised.encode("ascii", "ignore").decode("ascii").lower()
    return _NON_ALPHANUMERIC.sub("-", ascii_only).strip("-") or "item"

import re
import unicodedata

_NON_ALPHANUMERIC = re.compile(r"[^a-z0-9]+")


# NFKD decomposes an accent away from its letter, but only when the letter is there to
# begin with. These are single characters in Unicode with no ASCII base to strip back to,
# so without a map "Tørret Blad" slugs to "trret-blad" and "Straße" to "strae".
_TRANSLITERATE = str.maketrans(
    {
        "ø": "o",
        "Ø": "O",
        "ł": "l",
        "Ł": "L",
        "æ": "ae",
        "Æ": "Ae",
        "œ": "oe",
        "Œ": "Oe",
        "ß": "ss",
        "đ": "d",
        "Đ": "D",
        "ð": "d",
        "Ð": "D",
        "þ": "th",
        "Þ": "Th",
        "ı": "i",
    }
)


def slugify(value: str) -> str:
    """Turn a display name into a URL-safe slug.

    Transliterate the characters NFKD cannot help with, then NFKD the rest, so accented
    and Polish names ("Mięta") decompose to ASCII rather than being stripped to nothing.
    """
    normalised = unicodedata.normalize("NFKD", value.translate(_TRANSLITERATE))
    ascii_only = normalised.encode("ascii", "ignore").decode("ascii").lower()
    return _NON_ALPHANUMERIC.sub("-", ascii_only).strip("-") or "item"

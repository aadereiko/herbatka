import hashlib
from pathlib import Path

from app.core.config import get_settings

settings = get_settings()

MAX_BYTES = 5 * 1024 * 1024

# Sniffed from the bytes, not taken from the request. A client can claim any
# Content-Type it likes, and the filename is entirely its invention.
MAGIC: tuple[tuple[bytes, str], ...] = (
    (b"\xff\xd8\xff", ".jpg"),
    (b"\x89PNG\r\n\x1a\n", ".png"),
)


class ImageTooLarge(Exception):
    pass


class NotAnImage(Exception):
    pass


def _extension_for(data: bytes) -> str:
    for prefix, extension in MAGIC:
        if data.startswith(prefix):
            return extension
    # WEBP is a RIFF container: "RIFF" then 4 size bytes then "WEBP".
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    raise NotAnImage


def media_root() -> Path:
    root = Path(settings.media_root)
    root.mkdir(parents=True, exist_ok=True)
    return root


def store(data: bytes) -> str:
    """Write an uploaded image and return the URL it is served at.

    The stored name is the sha256 of the contents plus an extension derived from the
    magic bytes. Three things follow, and all of them matter:

      - The client's filename never reaches the filesystem, so "../../etc/passwd" and
        "shell.php" are not expressible.
      - The extension describes what the bytes actually are, not what the upload claimed.
      - Identical images collapse onto one file for free.
    """
    if len(data) > MAX_BYTES:
        raise ImageTooLarge(str(len(data)))

    extension = _extension_for(data)
    name = f"{hashlib.sha256(data).hexdigest()}{extension}"
    path = media_root() / name
    if not path.exists():
        path.write_bytes(data)
    return f"{settings.media_url_prefix}/{name}"

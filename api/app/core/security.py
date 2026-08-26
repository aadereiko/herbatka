import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from app.core.config import get_settings

settings = get_settings()

# Argon2id is the current password-hashing recommendation: memory-hard, so a GPU farm
# gains far less against it than against bcrypt or PBKDF2. The library's defaults are
# sensible and self-tuning across versions, which is why they are not overridden here.
_hasher = PasswordHasher()

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        _hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False
    return True


def needs_rehash(password_hash: str) -> bool:
    """True when the stored hash used weaker parameters than the current defaults.

    Lets an upgrade to stronger settings roll out transparently at each login rather
    than needing a password reset for everyone.
    """
    return _hasher.check_needs_rehash(password_hash)


def create_access_token(user_id: uuid.UUID, role: str) -> tuple[str, int]:
    """Return (token, expires_in_seconds).

    The role is embedded so that authorising a request needs no database round trip.
    The cost is up to 15 minutes of staleness after a role change — acceptable here,
    and the reason the access token TTL is short.
    """
    expires_in = settings.access_token_ttl_seconds
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": now + timedelta(seconds=expires_in),
        "typ": "access",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM), expires_in


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    # Reject a refresh token presented as a bearer token.
    if payload.get("typ") != "access":
        return None
    return payload


def new_refresh_token() -> tuple[str, str]:
    """Return (raw_token, sha256_hash).

    Refresh tokens are opaque random strings, not JWTs, precisely so they can be
    revoked: the database row is the source of truth, and deleting it ends the session
    immediately. A self-contained JWT would stay valid until it expired.

    sha256 rather than Argon2 is deliberate — the token is 256 bits of entropy, so
    there is no dictionary to attack and no reason to pay a slow hash on every refresh.
    """
    raw = secrets.token_urlsafe(32)
    return raw, hash_refresh_token(raw)


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()

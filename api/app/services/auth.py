import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import (
    hash_password,
    hash_refresh_token,
    needs_rehash,
    new_refresh_token,
    verify_password,
)
from app.models.user import AuthIdentity, RefreshToken, User
from app.services.errors import (
    EmailAlreadyRegistered,
    InvalidCredentials,
    InvalidRefreshToken,
)

settings = get_settings()


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    return await db.scalar(select(User).where(User.email == email))


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await db.get(User, user_id)


async def register_user(db: AsyncSession, email: str, password: str, display_name: str) -> User:
    if await get_user_by_email(db, email) is not None:
        raise EmailAlreadyRegistered(email)

    user = User(email=email, display_name=display_name)
    user.identities.append(
        AuthIdentity(
            provider="password",
            # Lowercased so the (provider, provider_subject) unique constraint also
            # catches case variants; User.email keeps whatever case the user typed.
            provider_subject=email.lower(),
            password_hash=hash_password(password),
        )
    )
    db.add(user)
    await db.flush()
    return user


async def authenticate(db: AsyncSession, email: str, password: str) -> User:
    """Look the account up by User.email, never by AuthIdentity.provider_subject.

    User.email is citext, so it matches regardless of case. provider_subject is a plain
    varchar because for OAuth it holds the provider's opaque subject claim, which IS
    case-sensitive. Resolving the user first keeps one canonical notion of "who this
    email belongs to" instead of two code paths that can disagree.
    """
    user = await get_user_by_email(db, email)
    identity = (
        await db.scalar(
            select(AuthIdentity).where(
                AuthIdentity.user_id == user.id,
                AuthIdentity.provider == "password",
            )
        )
        if user is not None
        else None
    )

    # Verify against a dummy hash when there is no account or no password identity, so
    # that every failure costs the same time. Otherwise response latency alone tells an
    # attacker which addresses are registered.
    if user is None or identity is None or identity.password_hash is None:
        verify_password(password, _DUMMY_HASH)
        raise InvalidCredentials

    if not verify_password(password, identity.password_hash):
        raise InvalidCredentials

    if not user.is_active:
        raise InvalidCredentials

    if needs_rehash(identity.password_hash):
        identity.password_hash = hash_password(password)

    return user


async def issue_refresh_token(db: AsyncSession, user: User, user_agent: str | None) -> str:
    raw, token_hash = new_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_ttl_days),
            user_agent=(user_agent or "")[:255] or None,
        )
    )
    await db.flush()
    return raw


async def rotate_refresh_token(
    db: AsyncSession, raw: str, user_agent: str | None
) -> tuple[User, str]:
    """Exchange a refresh token for a fresh one, invalidating the old.

    Rotation means a stolen token is useful only until the legitimate client next
    refreshes. The reuse branch below is what makes that detectable.
    """
    row = await db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw))
    )
    if row is None:
        raise InvalidRefreshToken

    now = datetime.now(UTC)

    if row.revoked_at is not None:
        # A token that was already rotated is being presented again, which means two
        # parties hold it — the legitimate client and someone else. Which is which is
        # unknowable, so end every session for this user and make them sign in again.
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == row.user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        raise InvalidRefreshToken

    if row.expires_at <= now:
        raise InvalidRefreshToken

    user = await db.get(User, row.user_id)
    if user is None or not user.is_active:
        raise InvalidRefreshToken

    row.revoked_at = now
    new_raw = await issue_refresh_token(db, user, user_agent)
    return user, new_raw


async def revoke_refresh_token(db: AsyncSession, raw: str) -> None:
    """Logout. Silent when the token is unknown — nothing useful to report."""
    await db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.token_hash == hash_refresh_token(raw), RefreshToken.revoked_at.is_(None)
        )
        .values(revoked_at=datetime.now(UTC))
    )


# Precomputed once at import: a real Argon2 hash of a value nobody can supply, used
# solely to burn the same CPU time as a genuine verification.
_DUMMY_HASH = hash_password("herbatka-timing-equaliser")

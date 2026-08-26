import uuid
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.household import HouseholdMember
from app.models.user import User
from app.schemas.common import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.services import household as household_service
from app.services.auth import get_user_by_id
from app.services.errors import NotAMember

# Annotated aliases rather than `= Depends(...)` defaults: the signature stays a plain
# type annotation, so linters and type checkers read it correctly, and each dependency
# is declared once instead of being retyped in every route.
DbSession = Annotated[AsyncSession, Depends(get_db)]

# auto_error=False so a missing header reaches our own handler and produces a
# consistent error body, instead of FastAPI's default 403.
_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    unauthorised = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorised

    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise unauthorised

    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise unauthorised from exc

    # The token carries the role, but the user row is still loaded: it is the only way
    # a deactivated account stops being able to act before its token expires.
    user = await get_user_by_id(db, user_id)
    if user is None or not user.is_active:
        raise unauthorised
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_optional_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User | None:
    """The viewer, if there is one. Never raises.

    The catalog is browsable signed out, but a signed-in visitor should see their own
    rating on each card. Failing closed to None — on a missing, malformed or expired
    token — means a stale token degrades to the anonymous view instead of turning the
    public catalog into a 401.
    """
    if credentials is None:
        return None
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        return None
    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        return None
    user = await get_user_by_id(db, user_id)
    return user if user is not None and user.is_active else None


OptionalUser = Annotated[User | None, Depends(get_optional_user)]


async def get_current_admin(user: CurrentUser) -> User:
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required",
        )
    return user


AdminUser = Annotated[User, Depends(get_current_admin)]


@dataclass(frozen=True)
class Pagination:
    page: int
    size: int


def pagination(
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> Pagination:
    """Shared page/size parsing.

    The upper bound is enforced here rather than per-route: one forgotten route with an
    unbounded `size` is all it takes for `?size=100000` to become a denial of service.
    """
    return Pagination(page=page, size=size)


PageParams = Annotated[Pagination, Depends(pagination)]


async def get_membership(
    household_id: uuid.UUID, user: "CurrentUser", db: "DbSession"
) -> HouseholdMember:
    """Resolve the caller's membership of a household, or 404.

    404 and not 403, deliberately. A 403 would confirm that a household with this id
    exists, letting anyone enumerate ids and learn who lives with whom. To a
    non-member, someone else's household is indistinguishable from one that is not
    there — which is the honest answer.
    """
    try:
        return await household_service.get_membership(db, household_id, user.id)
    except NotAMember as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Household not found"
        ) from exc


Membership = Annotated[HouseholdMember, Depends(get_membership)]


async def get_ownership(member: Membership) -> HouseholdMember:
    """Owner-only actions: renaming, deleting, and managing members and invites.

    403 here rather than 404, because at this point the caller has already proved they
    are a member — the household's existence is not a secret from them, only the
    permission is missing.
    """
    if member.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a household owner can do that",
        )
    return member


Ownership = Annotated[HouseholdMember, Depends(get_ownership)]

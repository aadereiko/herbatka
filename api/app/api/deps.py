import uuid
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User
from app.schemas.common import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.services.auth import get_user_by_id

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

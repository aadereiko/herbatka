from typing import Annotated

from fastapi import APIRouter, Cookie, HTTPException, Request, Response, status

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.core.security import create_access_token
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserOut, user_out
from app.services import auth as auth_service
from app.services.errors import (
    EmailAlreadyRegistered,
    InvalidCredentials,
    InvalidRefreshToken,
)

settings = get_settings()
router = APIRouter(prefix="/auth", tags=["auth"])

# Scoped to the auth routes: the browser then sends the refresh token only to the two
# endpoints that need it, rather than attaching it to every API call.
COOKIE_PATH = "/api/v1/auth"

RefreshCookie = Annotated[str | None, Cookie(alias=settings.refresh_cookie_name)]


def _set_refresh_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=raw_token,
        max_age=settings.refresh_token_ttl_days * 24 * 60 * 60,
        # httponly keeps the token out of reach of any JavaScript on the page, so an
        # XSS bug cannot walk off with a 30-day session. This is the whole reason the
        # refresh token lives in a cookie while the access token lives in memory.
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path=COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        path=COOKIE_PATH,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def _token_response(user: User, response: Response, raw_refresh: str) -> TokenResponse:
    access_token, expires_in = create_access_token(user.id, user.role)
    _set_refresh_cookie(response, raw_refresh)
    return TokenResponse(
        access_token=access_token,
        expires_in=expires_in,
        user=user_out(user),
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest, request: Request, response: Response, db: DbSession
) -> TokenResponse:
    try:
        user = await auth_service.register_user(
            db, str(payload.email), payload.password, payload.display_name
        )
    except EmailAlreadyRegistered as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That email address is already registered",
        ) from exc

    raw_refresh = await auth_service.issue_refresh_token(
        db, user, request.headers.get("user-agent")
    )
    return _token_response(user, response, raw_refresh)


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest, request: Request, response: Response, db: DbSession
) -> TokenResponse:
    try:
        user = await auth_service.authenticate(db, str(payload.email), payload.password)
    except InvalidCredentials as exc:
        # One message for both a wrong password and an unknown address: saying which
        # one was wrong turns the login form into an account-enumeration oracle.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        ) from exc

    raw_refresh = await auth_service.issue_refresh_token(
        db, user, request.headers.get("user-agent")
    )
    return _token_response(user, response, raw_refresh)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request, response: Response, db: DbSession, refresh_token: RefreshCookie = None
) -> TokenResponse:
    if refresh_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token"
        )
    try:
        user, new_raw = await auth_service.rotate_refresh_token(
            db, refresh_token, request.headers.get("user-agent")
        )
    except InvalidRefreshToken as exc:
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        ) from exc

    return _token_response(user, response, new_raw)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response, db: DbSession, refresh_token: RefreshCookie = None) -> None:
    if refresh_token is not None:
        await auth_service.revoke_refresh_token(db, refresh_token)
    _clear_refresh_cookie(response)


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> UserOut:
    return user_out(user)

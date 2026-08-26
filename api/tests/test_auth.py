from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.user import RefreshToken

settings = get_settings()

CREDENTIALS = {"email": "ada@example.com", "password": "chai-latte-99", "display_name": "Ada"}


async def register(client: AsyncClient, **overrides: str) -> dict:
    response = await client.post("/api/v1/auth/register", json={**CREDENTIALS, **overrides})
    assert response.status_code == 201, response.text
    return response.json()


class TestRegister:
    async def test_returns_a_token_and_the_new_user(self, client: AsyncClient) -> None:
        body = await register(client)

        assert body["token_type"] == "bearer"
        assert body["expires_in"] == settings.access_token_ttl_seconds
        assert body["user"]["email"] == "ada@example.com"
        assert body["user"]["display_name"] == "Ada"
        assert body["user"]["role"] == "user"

    async def test_never_echoes_the_password_back(self, client: AsyncClient) -> None:
        response = await client.post("/api/v1/auth/register", json=CREDENTIALS)

        assert CREDENTIALS["password"] not in response.text

    async def test_sets_an_httponly_refresh_cookie(self, client: AsyncClient) -> None:
        response = await client.post("/api/v1/auth/register", json=CREDENTIALS)

        cookie = response.headers["set-cookie"]
        assert settings.refresh_cookie_name in cookie
        # The whole point of the cookie: JavaScript must not be able to read it.
        assert "HttpOnly" in cookie
        assert "Path=/api/v1/auth" in cookie

    async def test_rejects_a_duplicate_email(self, client: AsyncClient) -> None:
        await register(client)

        response = await client.post("/api/v1/auth/register", json=CREDENTIALS)

        assert response.status_code == 409

    async def test_rejects_a_duplicate_email_differing_only_in_case(
        self, client: AsyncClient
    ) -> None:
        """citext is what makes this a 409 rather than a second account."""
        await register(client)

        response = await client.post(
            "/api/v1/auth/register", json={**CREDENTIALS, "email": "ADA@Example.com"}
        )

        assert response.status_code == 409

    async def test_rejects_a_short_password(self, client: AsyncClient) -> None:
        response = await client.post(
            "/api/v1/auth/register", json={**CREDENTIALS, "password": "short"}
        )

        assert response.status_code == 422

    async def test_never_stores_the_password_in_the_clear(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        from app.models.user import AuthIdentity

        await register(client)

        identity = await db.scalar(select(AuthIdentity))
        assert identity is not None
        assert identity.password_hash is not None
        assert CREDENTIALS["password"] not in identity.password_hash
        assert identity.password_hash.startswith("$argon2")


class TestLogin:
    async def test_succeeds_with_the_right_password(self, client: AsyncClient) -> None:
        await register(client)

        response = await client.post(
            "/api/v1/auth/login",
            json={"email": CREDENTIALS["email"], "password": CREDENTIALS["password"]},
        )

        assert response.status_code == 200
        assert response.json()["user"]["email"] == "ada@example.com"

    async def test_is_case_insensitive_on_the_email(self, client: AsyncClient) -> None:
        await register(client)

        response = await client.post(
            "/api/v1/auth/login",
            json={"email": "ADA@EXAMPLE.COM", "password": CREDENTIALS["password"]},
        )

        assert response.status_code == 200

    async def test_rejects_a_wrong_password(self, client: AsyncClient) -> None:
        await register(client)

        response = await client.post(
            "/api/v1/auth/login", json={"email": CREDENTIALS["email"], "password": "wrong-one-11"}
        )

        assert response.status_code == 401

    async def test_gives_the_same_answer_for_an_unknown_address(self, client: AsyncClient) -> None:
        """Identical wording for both failures: otherwise login enumerates accounts."""
        await register(client)

        wrong_password = await client.post(
            "/api/v1/auth/login", json={"email": CREDENTIALS["email"], "password": "wrong-one-11"}
        )
        unknown_email = await client.post(
            "/api/v1/auth/login", json={"email": "nobody@example.com", "password": "wrong-one-11"}
        )

        assert wrong_password.status_code == unknown_email.status_code == 401
        assert wrong_password.json() == unknown_email.json()


class TestMe:
    async def test_returns_the_signed_in_user(self, client: AsyncClient) -> None:
        token = (await register(client))["access_token"]

        response = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})

        assert response.status_code == 200
        assert response.json()["display_name"] == "Ada"

    async def test_requires_a_token(self, client: AsyncClient) -> None:
        response = await client.get("/api/v1/auth/me")

        assert response.status_code == 401

    async def test_rejects_a_malformed_token(self, client: AsyncClient) -> None:
        response = await client.get(
            "/api/v1/auth/me", headers={"Authorization": "Bearer not-a-jwt"}
        )

        assert response.status_code == 401

    async def test_rejects_a_refresh_token_used_as_a_bearer_token(
        self, client: AsyncClient
    ) -> None:
        await register(client)
        raw_refresh = client.cookies[settings.refresh_cookie_name]

        response = await client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {raw_refresh}"}
        )

        assert response.status_code == 401


class TestRefresh:
    async def test_issues_a_new_access_token(self, client: AsyncClient) -> None:
        await register(client)

        response = await client.post("/api/v1/auth/refresh")

        assert response.status_code == 200
        assert response.json()["user"]["email"] == "ada@example.com"

    async def test_rotates_the_cookie(self, client: AsyncClient) -> None:
        await register(client)
        first = client.cookies[settings.refresh_cookie_name]

        await client.post("/api/v1/auth/refresh")
        second = client.cookies[settings.refresh_cookie_name]

        assert first != second

    async def test_the_old_token_stops_working(self, client: AsyncClient) -> None:
        await register(client)
        stolen = client.cookies[settings.refresh_cookie_name]
        await client.post("/api/v1/auth/refresh")

        client.cookies.set(settings.refresh_cookie_name, stolen)
        response = await client.post("/api/v1/auth/refresh")

        assert response.status_code == 401

    async def test_reusing_a_rotated_token_ends_every_session(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        """Two parties hold the same token and we cannot tell which is legitimate,
        so every session for the user is revoked."""
        await register(client)
        stolen = client.cookies[settings.refresh_cookie_name]
        await client.post("/api/v1/auth/refresh")

        rotated = client.cookies[settings.refresh_cookie_name]
        client.cookies.set(settings.refresh_cookie_name, stolen)
        await client.post("/api/v1/auth/refresh")
        client.cookies.set(settings.refresh_cookie_name, rotated)

        live = await db.scalars(select(RefreshToken).where(RefreshToken.revoked_at.is_(None)))
        assert live.all() == []
        assert (await client.post("/api/v1/auth/refresh")).status_code == 401

    async def test_requires_a_cookie(self, client: AsyncClient) -> None:
        response = await client.post("/api/v1/auth/refresh")

        assert response.status_code == 401


class TestLogout:
    async def test_revokes_the_refresh_token(self, client: AsyncClient, db: AsyncSession) -> None:
        await register(client)

        response = await client.post("/api/v1/auth/logout")

        assert response.status_code == 204
        live = await db.scalars(select(RefreshToken).where(RefreshToken.revoked_at.is_(None)))
        assert live.all() == []

    async def test_is_harmless_without_a_session(self, client: AsyncClient) -> None:
        response = await client.post("/api/v1/auth/logout")

        assert response.status_code == 204

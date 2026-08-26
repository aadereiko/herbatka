import asyncio
from collections.abc import AsyncGenerator
from pathlib import Path

import asyncpg
import pytest
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.db.session import get_db
from app.main import app

API_ROOT = Path(__file__).resolve().parents[1]

# Tests run against a real Postgres, not SQLite: the schema leans on citext, CHECK
# constraints and cascades that SQLite would silently not enforce, so a green SQLite
# suite would prove very little.
#
# They run against a SEPARATE database from dev, though. Transaction rollback isolates
# tests from each other, but it does nothing about rows already sitting in the dev
# database — and a fixture that registers ada@example.com fails the moment a real Ada
# exists there. Two isolation problems, two mechanisms.


def _test_database_url() -> str:
    url = make_url(get_settings().database_url)
    return url.set(database=f"{url.database}_test").render_as_string(hide_password=False)


async def _create_database_if_missing(url_string: str) -> None:
    url = make_url(url_string)
    # CREATE DATABASE cannot run inside a transaction and cannot target the database
    # being created, so it goes through a plain asyncpg connection to `postgres`.
    connection = await asyncpg.connect(
        host=url.host,
        port=url.port,
        user=url.username,
        password=url.password,
        database="postgres",
    )
    try:
        exists = await connection.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1", url.database
        )
        if not exists:
            await connection.execute(f'CREATE DATABASE "{url.database}"')
    finally:
        await connection.close()


@pytest.fixture(scope="session")
def test_database_url() -> str:
    """Create the test database if needed and migrate it to head, once per run.

    Building the schema with the real migrations rather than Base.metadata.create_all
    means the suite also proves the migrations produce the schema the code expects.
    """
    url = _test_database_url()
    asyncio.run(_create_database_if_missing(url))

    config = Config(str(API_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "head")
    return url


@pytest.fixture
async def db_engine(test_database_url: str) -> AsyncGenerator[AsyncEngine]:
    # NullPool because pytest-asyncio gives each test its own event loop, and a pooled
    # asyncpg connection created on a previous loop blows up when reused on the next one.
    engine = create_async_engine(test_database_url, poolclass=NullPool)
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest.fixture
async def db(db_engine: AsyncEngine) -> AsyncGenerator[AsyncSession]:
    """A session inside a transaction that is always rolled back.

    join_transaction_mode "create_savepoint" means the application's own commit() lands
    on a savepoint, so production commit behaviour is exercised and the outer rollback
    still undoes it.
    """
    async with db_engine.connect() as connection:
        transaction = await connection.begin()
        session = AsyncSession(
            bind=connection,
            join_transaction_mode="create_savepoint",
            expire_on_commit=False,
        )
        try:
            yield session
        finally:
            await session.close()
            await transaction.rollback()


@pytest.fixture
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient]:
    """Drives the real ASGI app in-process — no socket, no running uvicorn."""

    async def override_get_db() -> AsyncGenerator[AsyncSession]:
        yield db
        await db.commit()

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()

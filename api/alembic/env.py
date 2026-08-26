import asyncio
from logging.config import fileConfig
from typing import Any

import sqlalchemy as sa
from alembic import context
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.models import Base  # imports every model, so autogenerate sees them all

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# One source of truth for the URL: app settings, which read the repo-root .env.
# Unless a caller already set one — the test suite points migrations at its own
# database this way, so `alembic upgrade` can build a schema that is not the dev one.
if not config.get_main_option("sqlalchemy.url", None):
    config.set_main_option("sqlalchemy.url", get_settings().database_url)

target_metadata = Base.metadata


def _enum_check_constraint_names() -> set[str]:
    """Names of the CHECK constraints that non-native Enum() columns generate.

    Enum(..., native_enum=False, create_constraint=True) emits its CHECK at DDL time;
    the constraint is not an object in Base.metadata. Autogenerate therefore sees it in
    the database, fails to find it in the model, and writes a drop_constraint into every
    single migration — quietly removing the validation the enums exist to provide.
    Derived from metadata rather than hardcoded so a new enum is covered automatically.
    """
    names: set[str] = set()
    for table in target_metadata.tables.values():
        for column in table.columns:
            if isinstance(column.type, sa.Enum) and column.type.name:
                names.add(column.type.name)
    return names


def include_object(
    obj: Any, name: str | None, type_: str, reflected: bool, compare_to: Any
) -> bool:
    return not (type_ == "check_constraint" and name in _enum_check_constraint_names())


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,  # catch column type changes, not just added/dropped columns
        compare_server_default=True,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())

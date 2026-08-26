import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Declarative base for every ORM model.

    Alembic's autogenerate compares the live database against Base.metadata, so every
    model module must be imported before autogenerate runs. app/models/__init__.py is
    the single place that does those imports.
    """


class UUIDPrimaryKey:
    """UUID primary keys rather than serial integers.

    Ids appear in URLs and in payloads shared between households and friends; sequential
    integers would leak how many users and teas exist and make neighbouring records
    guessable. Generated client-side so the object has its id before the flush.
    """

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


class Timestamps:
    """created_at / updated_at maintained by the database, not the application.

    server_default and onupdate mean a row written by a migration, a seed script or a
    psql session gets correct timestamps too — not only rows written through the ORM.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

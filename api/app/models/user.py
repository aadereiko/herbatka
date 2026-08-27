import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import CITEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamps, UUIDPrimaryKey
from app.models.catalog import TeaTypeEnum

# native_enum=False stores these as VARCHAR + CHECK rather than a PostgreSQL ENUM type.
# Adding a value to a PG enum inside a transaction is awkward and removing one is worse;
# a CHECK constraint is a one-line ALTER in a migration.
UserRole = Enum("user", "admin", name="user_role", native_enum=False, create_constraint=True)
AuthProvider = Enum(
    "password", "google", name="auth_provider", native_enum=False, create_constraint=True
)


class User(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "user_account"  # "user" is reserved in PostgreSQL

    # CITEXT makes uniqueness case-insensitive in the database itself, so Ada@x.com and
    # ada@x.com cannot both exist regardless of which code path inserts them.
    email: Mapped[str] = mapped_column(CITEXT, nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(80), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(500))

    # Free text, not a picklist. Pronouns people actually use do not fit a fixed set,
    # and guessing from a name is exactly the mistake this field exists to prevent.
    pronouns: Mapped[str | None] = mapped_column(String(40))
    bio: Mapped[str | None] = mapped_column(Text)
    # "Kraków", "London", "somewhere with hard water" — a place as a person describes it,
    # not a geocoded point. Shop locations are precise because a map needs them to be;
    # a profile does not, and asking for coordinates here would be intrusive.
    location: Mapped[str | None] = mapped_column(String(120))
    favourite_tea_type: Mapped[str | None] = mapped_column(TeaTypeEnum)
    role: Mapped[str] = mapped_column(
        UserRole, nullable=False, default="user", server_default="user"
    )
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True, server_default="true")

    identities: Mapped[list["AuthIdentity"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    __table_args__ = (CheckConstraint("length(display_name) >= 1", name="ck_display_name_present"),)


class AuthIdentity(UUIDPrimaryKey, Timestamps, Base):
    """One row per way a user can sign in.

    Password login is a provider like any other rather than a column on User. Adding
    Google later inserts rows here; it does not reshape a table that already holds data.
    """

    __tablename__ = "auth_identity"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_account.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(AuthProvider, nullable=False)
    # For password: the user's email. For OAuth: the provider's stable subject claim.
    provider_subject: Mapped[str] = mapped_column(String(320), nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255))

    user: Mapped[User] = relationship(back_populates="identities")

    __table_args__ = (
        UniqueConstraint("provider", "provider_subject", name="uq_identity_provider_subject"),
        UniqueConstraint("user_id", "provider", name="uq_identity_user_provider"),
        # A password identity is useless without a hash; an OAuth one must not carry one.
        CheckConstraint(
            "(provider = 'password') = (password_hash IS NOT NULL)",
            name="ck_password_hash_matches_provider",
        ),
    )


class RefreshToken(UUIDPrimaryKey, Timestamps, Base):
    """A rotating refresh token, stored only as a hash."""

    __tablename__ = "refresh_token"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_account.id", ondelete="CASCADE"), nullable=False
    )
    # sha256 of the raw token. A database leak then yields nothing replayable, the same
    # reason passwords are not stored in the clear.
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(String(255))

    user: Mapped[User] = relationship(back_populates="refresh_tokens")

    __table_args__ = (Index("ix_refresh_token_user_id", "user_id"),)

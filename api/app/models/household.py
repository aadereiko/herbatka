import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamps, UUIDPrimaryKey
from app.models.catalog import Tea
from app.models.user import User

MemberRoleEnum = Enum(
    "owner", "member", name="member_role", native_enum=False, create_constraint=True
)
StockEventKindEnum = Enum(
    "purchase",
    "brew",
    "adjust",
    "discard",
    name="stock_event_kind",
    native_enum=False,
    create_constraint=True,
)


class Household(UUIDPrimaryKey, Timestamps, Base):
    """Who shares the physical tin.

    Deliberately a different relationship from friendship: membership grants *write*
    access to stock, where friendship grants *read* access to opinions. One table for
    both would mean either your flatmate sees your reviews or your friends can drink
    your oolong.
    """

    __tablename__ = "household"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user_account.id", ondelete="SET NULL")
    )

    members: Mapped[list["HouseholdMember"]] = relationship(
        back_populates="household", cascade="all, delete-orphan"
    )
    invites: Mapped[list["HouseholdInvite"]] = relationship(
        back_populates="household", cascade="all, delete-orphan"
    )
    stock_items: Mapped[list["StockItem"]] = relationship(
        back_populates="household", cascade="all, delete-orphan"
    )


class HouseholdMember(Timestamps, Base):
    """Composite primary key, because (household, user) *is* the identity of a
    membership — a surrogate id would allow the same person to join twice."""

    __tablename__ = "household_member"

    household_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("household.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_account.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(
        MemberRoleEnum, nullable=False, default="member", server_default="member"
    )

    household: Mapped[Household] = relationship(back_populates="members")
    user: Mapped[User] = relationship()

    __table_args__ = (Index("ix_household_member_user_id", "user_id"),)


class HouseholdInvite(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "household_invite"

    household_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("household.id", ondelete="CASCADE"), nullable=False
    )
    # Short, unguessable, and unique across all households — the code alone is enough
    # to join, so it is generated from secrets, never from the household name or id.
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    invited_email: Mapped[str | None] = mapped_column(String(320))
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user_account.id", ondelete="SET NULL")
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user_account.id", ondelete="SET NULL")
    )

    household: Mapped[Household] = relationship(back_populates="invites")

    __table_args__ = (Index("ix_household_invite_household_id", "household_id"),)


class StockItem(UUIDPrimaryKey, Timestamps, Base):
    """One physical tin on a shelf."""

    __tablename__ = "stock_item"

    household_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("household.id", ondelete="CASCADE"), nullable=False
    )
    tea_id: Mapped[uuid.UUID] = mapped_column(
        # RESTRICT: a tea someone has on their shelf must not vanish from under them.
        ForeignKey("tea.id", ondelete="RESTRICT"),
        nullable=False,
    )

    # A cached sum of stock_event.delta_grams, recomputed in the same transaction as
    # every insert. The ledger is the truth; this is a materialised head so that
    # listing a shelf does not aggregate the whole history per row.
    quantity_grams: Mapped[Decimal] = mapped_column(
        Numeric(8, 2), nullable=False, default=0, server_default="0"
    )
    low_stock_grams: Mapped[Decimal] = mapped_column(
        Numeric(8, 2), nullable=False, default=10, server_default="10"
    )

    location: Mapped[str | None] = mapped_column(String(120))
    opened_at: Mapped[date | None] = mapped_column(Date)
    best_before: Mapped[date | None] = mapped_column(Date)
    purchased_at: Mapped[date | None] = mapped_column(Date)
    # Integer minor units plus a currency code, never a float: 4.30 is not representable
    # in binary floating point and money must not drift.
    price_paid_minor: Mapped[int | None] = mapped_column(Integer)
    currency: Mapped[str | None] = mapped_column(String(3))
    notes: Mapped[str | None] = mapped_column(Text)

    household: Mapped[Household] = relationship(back_populates="stock_items")
    tea: Mapped[Tea] = relationship()
    events: Mapped[list["StockEvent"]] = relationship(
        back_populates="stock_item",
        cascade="all, delete-orphan",
        order_by="StockEvent.occurred_at.desc()",
    )

    __table_args__ = (
        CheckConstraint("quantity_grams >= 0", name="ck_stock_quantity_non_negative"),
        CheckConstraint("low_stock_grams >= 0", name="ck_stock_low_threshold_non_negative"),
        CheckConstraint(
            "price_paid_minor IS NULL OR currency IS NOT NULL",
            name="ck_stock_price_has_currency",
        ),
        Index("ix_stock_item_household_id", "household_id"),
    )


class StockEvent(UUIDPrimaryKey, Timestamps, Base):
    """Append-only: every gram in or out of a tin, and who moved it.

    Signed deltas rather than an absolute reading, so the log answers "who finished the
    oolong" and "how fast do we get through this" — questions a mutable quantity column
    throws away. It is also what a future reorder suggester would need.
    """

    __tablename__ = "stock_event"

    stock_item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("stock_item.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        # SET NULL, not CASCADE: someone leaving the household must not erase the
        # history of a tin the others still share.
        ForeignKey("user_account.id", ondelete="SET NULL")
    )
    kind: Mapped[str] = mapped_column(StockEventKindEnum, nullable=False)
    delta_grams: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    stock_item: Mapped[StockItem] = relationship(back_populates="events")
    user: Mapped[User | None] = relationship()

    __table_args__ = (
        # A zero-delta event records nothing and would only add noise to the ledger.
        CheckConstraint("delta_grams <> 0", name="ck_stock_event_non_zero"),
        Index("ix_stock_event_item_occurred", "stock_item_id", "occurred_at"),
    )

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
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamps, UUIDPrimaryKey
from app.models.catalog import Tea
from app.models.shop import Shop
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
    image_url: Mapped[str | None] = mapped_column(String(500))
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
    """One offer to join a household, in one of exactly two flavours.

    **Why this is one table and not two.** M6h asked for "invite a friend", and the first
    instinct was a second table — `household_friend_invite` — beside this one. It is the
    same event: a household offers somebody a place on its shelf, that offer expires, and
    it is answered once. Splitting it would have duplicated `expires_at`, `accepted_at`,
    `accepted_by_id`, the revoke endpoint, the owner's pending list and the "already a
    member" check, and then required the owner's panel to merge two queries to answer the
    single question it exists to answer: *who have we asked?*

    **What the two flavours actually differ in is authority, and that is a constraint.**

    - A **code** invite is *bearer* authority: whoever holds the string may join, and the
      string is meant to be relayed through a channel we do not own.
    - A **friend** invite is *named* authority: exactly one account may accept it, we know
      which, and nothing is relayed anywhere.

    Two authorisation models in one row is the classic way to end up running the wrong
    check, so they are made mutually exclusive by `ck_household_invite_code_xor_recipient`
    rather than by everyone remembering. That single CHECK is what makes the two accept
    paths incapable of crossing: `accept_invite(code)` matches on `code = :code`, which no
    named invite can satisfy because its code is NULL, and `accept_invitation(id)` matches
    on `invited_user_id = :me`, which no code invite can satisfy because *its* recipient is
    NULL. `POST /households/join` therefore behaves in M6h exactly as it did in M3, and its
    tests did not need a line changed.

    `declined_at` records a refusal instead of deleting the row, which is the opposite of
    what a declined *friend request* does. The asymmetry is deliberate: a friend request is
    a private matter between two people and a silent "no" is a kindness, whereas a
    household has an owner who is administering a member list and is entitled to stop
    waiting. See `decline_invitation` in `services/household.py`.
    """

    __tablename__ = "household_invite"

    household_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("household.id", ondelete="CASCADE"), nullable=False
    )
    # Short, unguessable, and unique across all households — the code alone is enough
    # to join, so it is generated from secrets, never from the household name or id.
    #
    # Nullable since M6h, and only for a named invite: there is nothing to relay when the
    # recipient is a row in `user_account`, and minting a code anyway would quietly make
    # every "invite my flatmate" forwardable to a stranger. Postgres permits any number of
    # NULLs under a UNIQUE constraint, so the code's uniqueness is untouched.
    code: Mapped[str | None] = mapped_column(String(32), unique=True)
    invited_email: Mapped[str | None] = mapped_column(String(320))
    # The named recipient, and the *only* account that may answer this invite. CASCADE
    # rather than SET NULL: an invitation whose recipient no longer exists is not a
    # weaker invitation, it is no invitation at all — and SET NULL would silently turn it
    # into a codeless, recipientless row that violates the XOR below.
    invited_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user_account.id", ondelete="CASCADE")
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user_account.id", ondelete="SET NULL")
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user_account.id", ondelete="SET NULL")
    )
    declined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    household: Mapped[Household] = relationship(back_populates="invites")
    # Three foreign keys point at user_account now, so every relationship has to say which
    # one it walks — SQLAlchemy cannot guess and raises AmbiguousForeignKeysError.
    invited_user: Mapped[User | None] = relationship(foreign_keys=[invited_user_id])
    created_by: Mapped[User | None] = relationship(foreign_keys=[created_by_id])

    __table_args__ = (
        # Exactly one of the two flavours, never both and never neither. "Neither" would be
        # an invite nobody can accept; "both" would be a named invite with a bearer token
        # stapled to it, which is the security hole this table is shaped to avoid.
        CheckConstraint(
            "(code IS NULL) <> (invited_user_id IS NULL)",
            name="ck_household_invite_code_xor_recipient",
        ),
        # An invite is answered once. Accepted-and-declined is not a state anyone should
        # have to write a reader for.
        CheckConstraint(
            "accepted_at IS NULL OR declined_at IS NULL",
            name="ck_household_invite_one_answer",
        ),
        # Only a named recipient can decline: a code invite has nobody whose refusal it
        # would be recording.
        CheckConstraint(
            "declined_at IS NULL OR invited_user_id IS NOT NULL",
            name="ck_household_invite_decline_is_named",
        ),
        Index("ix_household_invite_household_id", "household_id"),
        # "What is waiting for me" reads by recipient across every household, so it needs
        # its own index — the partial unique below leads with household_id and cannot
        # serve it.
        Index("ix_household_invite_invited_user", "invited_user_id"),
        # At most one *open* invitation per person per household. The service checks this
        # first and answers 409 with a sentence; the index is what makes two owners
        # clicking "Invite Bruno" at the same instant impossible rather than merely
        # unlikely. Partial, because a household may quite reasonably re-invite somebody
        # who declined last month, and because an accepted invite is history.
        Index(
            "uq_household_invite_open_recipient",
            "household_id",
            "invited_user_id",
            unique=True,
            postgresql_where=text(
                "invited_user_id IS NOT NULL AND accepted_at IS NULL AND declined_at IS NULL"
            ),
        ),
    )


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
    # Where this tin came from. SET NULL, because a shop closing does not empty anyone's
    # cupboard.
    shop_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("shop.id", ondelete="SET NULL"))

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
    # Who put this tin on the shelf. Derivable from the opening purchase event, but
    # the feed reads it per row and a join to find "the earliest purchase event" is a
    # lot of work for a fact that never changes.
    added_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user_account.id", ondelete="SET NULL")
    )

    household: Mapped[Household] = relationship(back_populates="stock_items")
    tea: Mapped[Tea] = relationship()
    shop: Mapped["Shop | None"] = relationship()
    added_by: Mapped[User | None] = relationship(foreign_keys=[added_by_id])
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
    # Only meaningful on a `purchase`: which shop, and what it cost. Kept on the event
    # rather than only on the tin so a top-up from a different shop is not lost.
    shop_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("shop.id", ondelete="SET NULL"))
    price_paid_minor: Mapped[int | None] = mapped_column(Integer)
    currency: Mapped[str | None] = mapped_column(String(3))

    stock_item: Mapped[StockItem] = relationship(back_populates="events")
    user: Mapped[User | None] = relationship()

    __table_args__ = (
        # A zero-delta event records nothing and would only add noise to the ledger.
        CheckConstraint("delta_grams <> 0", name="ck_stock_event_non_zero"),
        Index("ix_stock_event_item_occurred", "stock_item_id", "occurred_at"),
    )

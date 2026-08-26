import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamps, UUIDPrimaryKey
from app.models.user import User

FriendshipStatusEnum = Enum(
    "pending",
    "accepted",
    "blocked",
    name="friendship_status",
    native_enum=False,
    create_constraint=True,
)


class Friendship(UUIDPrimaryKey, Timestamps, Base):
    """One row per pair of people, in a canonical order.

    user_a_id is always the smaller uuid. Without that rule the same relationship can
    exist twice — A→B and B→A — and every read has to check both directions and then
    decide which row wins when they disagree. The CHECK plus the unique constraint make
    the duplicate unrepresentable rather than merely discouraged.

    Ordering the pair loses "who asked", so that is kept separately in requested_by_id.
    Likewise blocked_by_id: a block is not symmetric, and the person who did it is the
    only one who can undo it.
    """

    __tablename__ = "friendship"

    user_a_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_account.id", ondelete="CASCADE"), nullable=False
    )
    user_b_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_account.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(FriendshipStatusEnum, nullable=False, default="pending")

    requested_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user_account.id", ondelete="SET NULL")
    )
    blocked_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user_account.id", ondelete="SET NULL")
    )
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user_a: Mapped[User] = relationship(foreign_keys=[user_a_id])
    user_b: Mapped[User] = relationship(foreign_keys=[user_b_id])

    __table_args__ = (
        UniqueConstraint("user_a_id", "user_b_id", name="uq_friendship_pair"),
        # Enforces the canonical order and, as a side effect, forbids befriending
        # yourself — a < a is false for every value.
        CheckConstraint("user_a_id < user_b_id", name="ck_friendship_canonical_order"),
        CheckConstraint(
            "(status = 'blocked') = (blocked_by_id IS NOT NULL)",
            name="ck_friendship_block_has_blocker",
        ),
        Index("ix_friendship_user_b", "user_b_id"),
    )

    def other_than(self, user_id: uuid.UUID) -> uuid.UUID:
        return self.user_b_id if self.user_a_id == user_id else self.user_a_id


def canonical_pair(one: uuid.UUID, two: uuid.UUID) -> tuple[uuid.UUID, uuid.UUID]:
    """The pair in the order the table stores it. Every read and write goes through
    this, so no caller has to remember the rule."""
    return (one, two) if one < two else (two, one)

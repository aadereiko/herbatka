import uuid
from datetime import date

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamps, UUIDPrimaryKey
from app.models.catalog import Tea
from app.models.user import User

# Scores are 1–10 rather than 1–5: half the tea world rates out of five and immediately
# wants halves. Ten integers avoid fractional scores without losing resolution.
SCORE_MIN = 1
SCORE_MAX = 10


def _score_range(column: str) -> CheckConstraint:
    return CheckConstraint(
        f"{column} IS NULL OR ({column} >= {SCORE_MIN} AND {column} <= {SCORE_MAX})",
        name=f"ck_review_{column}_range",
    )


class Review(UUIDPrimaryKey, Timestamps, Base):
    """One standing opinion per person per tea.

    Enforced by a unique (user_id, tea_id): a review is an opinion you hold and revise,
    not an event log. Per-session tasting notes would be a different table with a
    different shape, and conflating them would make "what do you think of this tea"
    unanswerable without picking a note arbitrarily.
    """

    __tablename__ = "review"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_account.id", ondelete="CASCADE"), nullable=False
    )
    tea_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tea.id", ondelete="CASCADE"), nullable=False
    )

    score: Mapped[int] = mapped_column(Integer, nullable=False)
    aroma: Mapped[int | None] = mapped_column(Integer)
    flavour: Mapped[int | None] = mapped_column(Integer)
    aftertaste: Mapped[int | None] = mapped_column(Integer)

    body: Mapped[str | None] = mapped_column(Text)
    brewed_at: Mapped[date | None] = mapped_column(Date)

    user: Mapped[User] = relationship()
    tea: Mapped[Tea] = relationship()

    __table_args__ = (
        UniqueConstraint("user_id", "tea_id", name="uq_review_user_tea"),
        CheckConstraint(
            f"score >= {SCORE_MIN} AND score <= {SCORE_MAX}", name="ck_review_score_range"
        ),
        _score_range("aroma"),
        _score_range("flavour"),
        _score_range("aftertaste"),
        # Every aggregate and every review list is "for this tea", so the index leads
        # with tea_id.
        Index("ix_review_tea_created", "tea_id", "created_at"),
        Index("ix_review_user_id", "user_id"),
    )

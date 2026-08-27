import uuid
from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, Numeric, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamps, UUIDPrimaryKey
from app.models.catalog import Tea
from app.models.review import SCORE_MAX, SCORE_MIN
from app.models.shop import Shop
from app.models.user import User


class FavouriteTea(Timestamps, Base):
    """A star, not a score.

    Separate from `review` on purpose: you can love a tea you have never got round to
    rating, and rate one 9 without wanting it on a shortlist. Folding the two together
    would make "my favourites" mean "things I happened to score highly", which is a
    different and less useful list.
    """

    __tablename__ = "favourite_tea"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_account.id", ondelete="CASCADE"), primary_key=True
    )
    tea_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tea.id", ondelete="CASCADE"), primary_key=True
    )

    tea: Mapped[Tea] = relationship()

    __table_args__ = (Index("ix_favourite_tea_user", "user_id"),)


class FavouriteShop(Timestamps, Base):
    __tablename__ = "favourite_shop"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_account.id", ondelete="CASCADE"), primary_key=True
    )
    shop_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("shop.id", ondelete="CASCADE"), primary_key=True
    )

    shop: Mapped[Shop] = relationship()

    __table_args__ = (Index("ix_favourite_shop_user", "user_id"),)


class ShopReview(UUIDPrimaryKey, Timestamps, Base):
    """One standing opinion per person per shop — the same rule as tea reviews.

    A separate table rather than a polymorphic `review(subject_type, subject_id)`: the
    two have different foreign keys and different cascade rules, and a polymorphic key
    cannot be a real foreign key at all, which is how orphaned rows happen.
    """

    __tablename__ = "shop_review"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_account.id", ondelete="CASCADE"), nullable=False
    )
    shop_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("shop.id", ondelete="CASCADE"), nullable=False
    )
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    body: Mapped[str | None] = mapped_column(Text)

    user: Mapped[User] = relationship()
    shop: Mapped[Shop] = relationship()

    __table_args__ = (
        UniqueConstraint("user_id", "shop_id", name="uq_shop_review_user_shop"),
        CheckConstraint(
            f"score >= {SCORE_MIN} AND score <= {SCORE_MAX}", name="ck_shop_review_score_range"
        ),
        Index("ix_shop_review_shop_created", "shop_id", "created_at"),
    )


class BrewingNote(Timestamps, Base):
    """How *you* brew a tea, as opposed to what the packet says.

    The catalog's figures are the vendor's suggestion. This is the one you arrived at
    after the third time it came out bitter, and it is the one that should be showing
    when you are standing at the kettle.
    """

    __tablename__ = "brewing_note"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_account.id", ondelete="CASCADE"), primary_key=True
    )
    tea_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tea.id", ondelete="CASCADE"), primary_key=True
    )

    brew_temp_c: Mapped[int | None] = mapped_column(Integer)
    brew_seconds: Mapped[int | None] = mapped_column(Integer)
    grams_per_100ml: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    note: Mapped[str | None] = mapped_column(Text)

    tea: Mapped[Tea] = relationship()

    __table_args__ = (
        CheckConstraint(
            "brew_temp_c IS NULL OR brew_temp_c BETWEEN 40 AND 100", name="ck_brewing_note_temp"
        ),
        CheckConstraint("brew_seconds IS NULL OR brew_seconds > 0", name="ck_brewing_note_seconds"),
        # A note with nothing in it is a row that says nothing; the API deletes instead.
        CheckConstraint(
            "brew_temp_c IS NOT NULL OR brew_seconds IS NOT NULL "
            "OR grams_per_100ml IS NOT NULL OR note IS NOT NULL",
            name="ck_brewing_note_not_empty",
        ),
    )

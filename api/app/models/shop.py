import uuid
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamps, UUIDPrimaryKey
from app.models.catalog import Tea


class Shop(UUIDPrimaryKey, Timestamps, Base):
    """Somewhere tea comes from.

    One model for both kinds. An online shop fills in `website`, a bricks-and-mortar one
    fills in the address fields, and a chain with a site fills in both — so the
    distinction is a property of the row rather than of the schema. Two tables would
    have meant two forms, two lists and a union query every time you wanted "all shops".
    """

    __tablename__ = "shop"

    slug: Mapped[str] = mapped_column(String(160), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    website: Mapped[str | None] = mapped_column(String(500))
    address: Mapped[str | None] = mapped_column(String(300))
    city: Mapped[str | None] = mapped_column(String(120))
    country: Mapped[str | None] = mapped_column(String(60))
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500))

    is_approved: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user_account.id", ondelete="SET NULL")
    )

    listings: Mapped[list["ShopListing"]] = relationship(
        back_populates="shop", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "website IS NOT NULL OR address IS NOT NULL OR city IS NOT NULL",
            name="ck_shop_reachable_somehow",
        ),
        Index("ix_shop_approved_city", "is_approved", "city"),
    )


class ShopListing(UUIDPrimaryKey, Timestamps, Base):
    """A tea a shop sells, at a pack size and a price."""

    __tablename__ = "shop_listing"

    shop_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("shop.id", ondelete="CASCADE"), nullable=False
    )
    tea_id: Mapped[uuid.UUID] = mapped_column(
        # RESTRICT: deleting a tea that shops sell would silently empty their shelves.
        ForeignKey("tea.id", ondelete="RESTRICT"),
        nullable=False,
    )

    pack_grams: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    # Integer minor units plus a currency, never a float — 4.30 is not representable in
    # binary floating point and prices must not drift.
    price_minor: Mapped[int | None] = mapped_column(Integer)
    currency: Mapped[str | None] = mapped_column(String(3))
    product_url: Mapped[str | None] = mapped_column(String(500))
    is_available: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    shop: Mapped[Shop] = relationship(back_populates="listings")
    tea: Mapped[Tea] = relationship()

    __table_args__ = (
        # One row per (shop, tea, pack size): a shop legitimately sells the same tea in
        # 50 g and 100 g packs, but not the same tea twice at the same size.
        # NULLS NOT DISTINCT so two "unspecified pack size" rows also collide.
        UniqueConstraint(
            "shop_id",
            "tea_id",
            "pack_grams",
            name="uq_listing_shop_tea_pack",
            postgresql_nulls_not_distinct=True,
        ),
        CheckConstraint("pack_grams IS NULL OR pack_grams > 0", name="ck_listing_pack_positive"),
        CheckConstraint(
            "price_minor IS NULL OR price_minor >= 0", name="ck_listing_price_non_negative"
        ),
        CheckConstraint(
            "price_minor IS NULL OR currency IS NOT NULL", name="ck_listing_price_has_currency"
        ),
        Index("ix_shop_listing_tea_id", "tea_id"),
    )

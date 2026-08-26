import uuid
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
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

# native_enum=False → VARCHAR + CHECK rather than a PostgreSQL ENUM type. Adding a value
# to a PG enum inside a transaction is awkward and removing one is worse; a CHECK
# constraint is a one-line ALTER in a migration, which matters for a vocabulary like
# tea_type that will grow.
TeaTypeEnum = Enum(
    "green",
    "black",
    "oolong",
    "puerh",
    "white",
    "herbal",
    "rooibos",
    "blend",
    name="tea_type",
    native_enum=False,
    create_constraint=True,
)
CaffeineLevelEnum = Enum(
    "none",
    "low",
    "medium",
    "high",
    name="caffeine_level",
    native_enum=False,
    create_constraint=True,
)
IngredientCategoryEnum = Enum(
    "leaf",
    "herb",
    "flower",
    "spice",
    "fruit",
    "other",
    name="ingredient_category",
    native_enum=False,
    create_constraint=True,
)


class Brand(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "brand"

    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    country: Mapped[str | None] = mapped_column(String(60))
    website: Mapped[str | None] = mapped_column(String(300))

    teas: Mapped[list["Tea"]] = relationship(back_populates="brand")


class Ingredient(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "ingredient"

    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str] = mapped_column(IngredientCategoryEnum, nullable=False)
    is_caffeinated: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    description: Mapped[str | None] = mapped_column(Text)

    tea_links: Mapped[list["TeaIngredient"]] = relationship(back_populates="ingredient")


class Tea(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "tea"

    slug: Mapped[str] = mapped_column(String(160), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    brand_id: Mapped[uuid.UUID | None] = mapped_column(
        # A brand that goes away should not take its teas with it: the tea still exists
        # on someone's shelf. SET NULL, not CASCADE.
        ForeignKey("brand.id", ondelete="SET NULL")
    )
    tea_type: Mapped[str] = mapped_column(TeaTypeEnum, nullable=False)
    caffeine_level: Mapped[str] = mapped_column(
        CaffeineLevelEnum, nullable=False, default="medium", server_default="medium"
    )
    origin_country: Mapped[str | None] = mapped_column(String(60))
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500))

    brew_temp_c: Mapped[int | None] = mapped_column(Integer)
    brew_seconds: Mapped[int | None] = mapped_column(Integer)
    grams_per_100ml: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))

    # Users may submit teas; an admin promotes them into the shared catalog. Without
    # this the catalog either stays empty or fills with duplicates and junk.
    is_approved: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user_account.id", ondelete="SET NULL")
    )

    brand: Mapped[Brand | None] = relationship(back_populates="teas")
    ingredient_links: Mapped[list["TeaIngredient"]] = relationship(
        back_populates="tea", cascade="all, delete-orphan", order_by="TeaIngredient.position"
    )

    __table_args__ = (
        CheckConstraint(
            "brew_temp_c IS NULL OR brew_temp_c BETWEEN 40 AND 100", name="ck_brew_temp"
        ),
        CheckConstraint("brew_seconds IS NULL OR brew_seconds > 0", name="ck_brew_seconds"),
        # The catalog is browsed almost exclusively as "approved teas of type X".
        Index("ix_tea_approved_type", "is_approved", "tea_type"),
    )


class TeaIngredient(Timestamps, Base):
    """The tea↔ingredient join, which carries data of its own.

    A plain many-to-many association table would not have somewhere to put the
    percentage or the primary flag, which is why this is an explicit model with a
    composite primary key rather than a `secondary=` relationship.
    """

    __tablename__ = "tea_ingredient"

    tea_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tea.id", ondelete="CASCADE"), primary_key=True
    )
    ingredient_id: Mapped[uuid.UUID] = mapped_column(
        # RESTRICT, not CASCADE: deleting an ingredient that teas still reference would
        # silently rewrite their recipes. The API turns this into a 409 instead.
        ForeignKey("ingredient.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    percentage: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    is_primary: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    tea: Mapped[Tea] = relationship(back_populates="ingredient_links")
    ingredient: Mapped[Ingredient] = relationship(back_populates="tea_links")

    __table_args__ = (
        CheckConstraint(
            "percentage IS NULL OR (percentage > 0 AND percentage <= 100)",
            name="ck_ingredient_percentage",
        ),
        Index("ix_tea_ingredient_ingredient_id", "ingredient_id"),
    )

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
    # Same String(500) as Tea, Shop and Household: an uploaded path from POST /uploads/image,
    # never a blob. Still nullable, and still expected to be null for anything the seed has
    # never heard of — the UI keeps drawing a per-category illustration for those rather
    # than treating "no picture" as a broken card.
    image_url: Mapped[str | None] = mapped_column(String(500))

    # ------------------------------------------------------------------ picture credit
    #
    # Most seeded pictures are Wikimedia Commons photographs under CC BY or CC BY-SA, and
    # those licences require attribution *to the reader* — a comment in a data file does
    # not discharge the obligation, a line on the card does. So the credit is data, and it
    # travels with the picture rather than living beside it in a table somebody has to
    # remember to look at.
    #
    # Four columns rather than one pre-formatted string, because the card renders two
    # different links out of them — the photographer's name points at the Commons file
    # page, the licence name points at the deed — and reconstituting two hrefs by parsing
    # a display string back apart is how attribution quietly goes wrong. `image_license`
    # is not derived from a lookup on the short name either: Commons hands us the exact
    # deed URL, and guessing it would be wrong for the PD and "no restrictions" marks that
    # are not Creative Commons at all.
    #
    # All four are null for an admin's own upload, and that asymmetry is the point: our
    # photograph of our clove needs no permission from anybody, so the card shows no
    # credit. See `update_ingredient`, which clears these whenever the picture changes —
    # a stale credit is worse than none, because it is a false claim about a stranger.
    image_attribution: Mapped[str | None] = mapped_column(String(200))
    image_license: Mapped[str | None] = mapped_column(String(60))
    image_license_url: Mapped[str | None] = mapped_column(String(300))
    #: The Commons *file page*, not the image bytes — that is where the licence, the full
    #: author record and the edit history actually live.
    image_source_url: Mapped[str | None] = mapped_column(String(500))

    tea_links: Mapped[list["TeaIngredient"]] = relationship(back_populates="ingredient")

    __table_args__ = (
        # A credit for a picture that is not there credits nobody for nothing. This is the
        # invariant that makes "clear the credit whenever the picture changes" enforceable
        # rather than merely intended: forget the clearing and the very next write fails
        # loudly, instead of leaving a photographer's name attached to somebody else's
        # photograph for as long as the row lives.
        CheckConstraint(
            "image_attribution IS NULL OR image_url IS NOT NULL",
            name="ck_ingredient_credit_needs_a_picture",
        ),
    )


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

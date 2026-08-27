import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from app.schemas.preference import BrewingNote
    from app.schemas.review import Review

TeaType = Literal["green", "black", "oolong", "puerh", "white", "herbal", "rooibos", "blend"]
CaffeineLevel = Literal["none", "low", "medium", "high"]
IngredientCategory = Literal["leaf", "herb", "flower", "spice", "fruit", "other"]


class IngredientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    category: IngredientCategory
    is_caffeinated: bool
    description: str | None


class IngredientTaste(IngredientOut):
    """An ingredient plus what people think of it, and what *you* think of it.

    A separate model from `IngredientOut` rather than three optional fields on it. The
    admin endpoints that create and edit an ingredient return the plain one — nobody has
    rated a thing that did not exist ten milliseconds ago — and the read endpoints return
    this. Required fields, no defaults: if `attach_ingredient_ratings` is ever forgotten,
    that is a 500 on the endpoint that forgot it, not a page quietly reporting that no
    one has ever rated anything.
    """

    model_config = ConfigDict(from_attributes=True)

    #: Yours, or null — including when signed out. Distinct from a score of 1: "no
    #: opinion on hibiscus" and "actively dislike hibiscus" are different facts.
    my_score: int | None
    average_score: float | None
    rating_count: int


class IngredientRatingInput(BaseModel):
    score: int = Field(ge=1, le=10)


class IngredientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: IngredientCategory
    is_caffeinated: bool = False
    description: str | None = None


class IngredientUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    category: IngredientCategory | None = None
    is_caffeinated: bool | None = None
    description: str | None = None


class BrandRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str


class BrandOut(BrandRef):
    country: str | None
    website: str | None


class BrandCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    country: str | None = Field(default=None, max_length=60)
    website: str | None = Field(default=None, max_length=300)


class BrandUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    country: str | None = Field(default=None, max_length=60)
    website: str | None = Field(default=None, max_length=300)


class TeaIngredientIn(BaseModel):
    ingredient_id: uuid.UUID
    percentage: float | None = Field(default=None, gt=0, le=100)
    is_primary: bool = False


class TeaIngredientOut(BaseModel):
    ingredient: IngredientTaste
    percentage: float | None
    is_primary: bool


class TeaSummary(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    tea_type: TeaType
    caffeine_level: CaffeineLevel
    image_url: str | None
    brand: BrandRef | None
    is_approved: bool
    # Denormalised onto the summary so a catalog card can show "gunpowder green, mint"
    # without the client fetching every tea's full ingredient list.
    primary_ingredients: list[str]

    # null, never 0, when nobody has rated it — "0.0" reads as a terrible tea rather
    # than an unrated one.
    average_score: float | None
    review_count: int
    # A star, not a score: you can love a tea you have never got round to rating.
    is_favourite: bool
    # The caller's own score, kept separate from the crowd average so the UI can show
    # "8.2 average · you rated 9" instead of blending the two.
    my_score: int | None


class TeaDetail(TeaSummary):
    description: str | None
    origin_country: str | None
    brew_temp_c: int | None
    brew_seconds: int | None
    grams_per_100ml: float | None
    ingredients: list[TeaIngredientOut]
    created_at: datetime

    average_aroma: float | None
    average_flavour: float | None
    average_aftertaste: float | None
    # Forward-referenced: schemas.review imports TeaRef by way of schemas.household,
    # which imports TeaType from here. A TYPE_CHECKING-only import keeps that cycle out
    # of runtime; schemas.review calls TeaDetail.model_rebuild() to resolve it.
    # No default: the field is always present in a detail response, so making it
    # optional would generate `my_review?: Review | null` and push a needless undefined
    # branch onto every client.
    my_review: "Review | None"
    # Your own brewing figures, when you have set any. The catalog's stay on the
    # summary fields above — this does not overwrite them, it sits beside them.
    my_brewing: "BrewingNote | None" = None


class TeaCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    tea_type: TeaType
    caffeine_level: CaffeineLevel = "medium"
    brand_id: uuid.UUID | None = None
    origin_country: str | None = Field(default=None, max_length=60)
    description: str | None = None
    image_url: str | None = Field(default=None, max_length=500)
    brew_temp_c: int | None = Field(default=None, ge=40, le=100)
    brew_seconds: int | None = Field(default=None, gt=0)
    grams_per_100ml: float | None = Field(default=None, gt=0)
    ingredients: list[TeaIngredientIn] = Field(default_factory=list)


class TeaUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    tea_type: TeaType | None = None
    caffeine_level: CaffeineLevel | None = None
    brand_id: uuid.UUID | None = None
    origin_country: str | None = Field(default=None, max_length=60)
    description: str | None = None
    image_url: str | None = Field(default=None, max_length=500)
    brew_temp_c: int | None = Field(default=None, ge=40, le=100)
    brew_seconds: int | None = Field(default=None, gt=0)
    grams_per_100ml: float | None = Field(default=None, gt=0)
    # None means "leave the recipe alone"; [] means "remove every ingredient".
    ingredients: list[TeaIngredientIn] | None = None


def _summary_fields(tea: Any, ratings: Any) -> dict[str, Any]:
    return {
        "average_score": ratings.average_score,
        "review_count": ratings.review_count,
        "my_score": ratings.my_score,
        "is_favourite": ratings.is_favourite,
        "id": tea.id,
        "slug": tea.slug,
        "name": tea.name,
        "tea_type": tea.tea_type,
        "caffeine_level": tea.caffeine_level,
        "image_url": tea.image_url,
        "brand": BrandRef.model_validate(tea.brand) if tea.brand else None,
        "is_approved": tea.is_approved,
        # Falls back to the first three ingredients when nothing is flagged primary, so
        # a card is never blank just because whoever entered the tea skipped the flag.
        "primary_ingredients": [
            link.ingredient.name for link in tea.ingredient_links if link.is_primary
        ]
        or [link.ingredient.name for link in tea.ingredient_links[:3]],
    }


def tea_summary(tea: Any, ratings: Any) -> TeaSummary:
    """Build the list-card view. Assumes brand and ingredient_links are eager-loaded."""
    return TeaSummary(**_summary_fields(tea, ratings))


def tea_detail(tea: Any, ratings: Any, my_review: Any = None, my_brewing: Any = None) -> TeaDetail:
    return TeaDetail(
        **_summary_fields(tea, ratings),
        average_aroma=ratings.average_aroma,
        average_flavour=ratings.average_flavour,
        average_aftertaste=ratings.average_aftertaste,
        my_review=my_review,
        my_brewing=my_brewing,
        description=tea.description,
        origin_country=tea.origin_country,
        brew_temp_c=tea.brew_temp_c,
        brew_seconds=tea.brew_seconds,
        grams_per_100ml=float(tea.grams_per_100ml) if tea.grams_per_100ml is not None else None,
        ingredients=[
            TeaIngredientOut(
                ingredient=IngredientTaste.model_validate(link.ingredient),
                percentage=float(link.percentage) if link.percentage is not None else None,
                is_primary=link.is_primary,
            )
            for link in tea.ingredient_links
        ],
        created_at=tea.created_at,
    )

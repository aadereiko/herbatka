import uuid
from dataclasses import dataclass
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

# A direct import, not a forward reference: schemas.preference does not import this
# module, so there is no cycle to work around here.
from app.schemas.household import StockItem, StockItemDetail, TeaRef
from app.schemas.preference import ShopReview


@dataclass(frozen=True)
class ShopAggregates:
    """Everything about a shop that is computed rather than stored.

    A dataclass instead of six more positional arguments: `shop_summary(shop, 5, None,
    7.5, 2, None, True)` is unreadable at the call site and one transposition away from
    reporting a rating as a distance.
    """

    listing_count: int = 0
    distance_km: float | None = None
    average_score: float | None = None
    review_count: int = 0
    my_score: int | None = None
    is_favourite: bool = False


class ShopRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str


class ShopSummary(ShopRef):
    city: str | None
    country: str | None
    website: str | None
    image_url: str | None
    is_approved: bool
    listing_count: int
    latitude: float | None
    longitude: float | None
    # Only when the request supplied a position. null otherwise — not 0, which would
    # read as "you are standing in it".
    distance_km: float | None
    # null, never 0, when nobody has rated it — the same rule teas follow.
    average_score: float | None
    review_count: int
    my_score: int | None
    is_favourite: bool


class ShopDetail(ShopSummary):
    description: str | None
    address: str | None
    created_at: datetime
    my_review: ShopReview | None = None


class ShopCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    website: str | None = Field(default=None, max_length=500)
    address: str | None = Field(default=None, max_length=300)
    city: str | None = Field(default=None, max_length=120)
    country: str | None = Field(default=None, max_length=60)
    description: str | None = None
    image_url: str | None = Field(default=None, max_length=500)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def reachable_somehow(self) -> "ShopCreate":
        # Mirrors ck_shop_reachable_somehow. A shop with no website and no location is
        # not findable, and the caller deserves a 422 naming the problem rather than a
        # 500 from an IntegrityError.
        if not (self.website or self.address or self.city):
            raise ValueError("a shop needs a website, an address, or at least a city")
        return self


class ShopUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    website: str | None = Field(default=None, max_length=500)
    address: str | None = Field(default=None, max_length=300)
    city: str | None = Field(default=None, max_length=120)
    country: str | None = Field(default=None, max_length=60)
    description: str | None = None
    image_url: str | None = Field(default=None, max_length=500)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def pin_is_complete(self) -> "ShopUpdate":
        # Mirrors ck_shop_pin_is_complete: half a pin is not a place.
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("latitude and longitude must be given together")
        return self


class Listing(BaseModel):
    id: uuid.UUID
    tea: TeaRef
    pack_grams: float | None
    # Integer minor units plus a currency code. A float price drifts, and a price with
    # no currency is a number, not a price.
    price_minor: int | None
    currency: str | None
    product_url: str | None
    is_available: bool


class ListingWithShop(Listing):
    shop: ShopSummary


class ListingCreate(BaseModel):
    tea_id: uuid.UUID
    pack_grams: float | None = Field(default=None, gt=0, le=999999)
    price_minor: int | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    product_url: str | None = Field(default=None, max_length=500)
    is_available: bool = True

    @model_validator(mode="after")
    def price_needs_a_currency(self) -> "ListingCreate":
        if self.price_minor is not None and self.currency is None:
            raise ValueError("currency is required when price_minor is given")
        return self


class ListingUpdate(BaseModel):
    pack_grams: float | None = Field(default=None, gt=0, le=999999)
    price_minor: int | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    product_url: str | None = Field(default=None, max_length=500)
    is_available: bool | None = None


class BuyRequest(BaseModel):
    """Recording a purchase, not taking one. No money moves through this app."""

    household_id: uuid.UUID
    grams: float = Field(gt=0, le=999999)
    price_paid_minor: int | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    purchased_at: date | None = None

    @model_validator(mode="after")
    def price_needs_a_currency(self) -> "BuyRequest":
        if self.price_paid_minor is not None and self.currency is None:
            raise ValueError("currency is required when price_paid_minor is given")
        return self


class UploadedImage(BaseModel):
    url: str


def shop_summary(shop: object, agg: ShopAggregates) -> ShopSummary:
    return ShopSummary(
        id=shop.id,  # type: ignore[attr-defined]
        slug=shop.slug,  # type: ignore[attr-defined]
        name=shop.name,  # type: ignore[attr-defined]
        city=shop.city,  # type: ignore[attr-defined]
        country=shop.country,  # type: ignore[attr-defined]
        website=shop.website,  # type: ignore[attr-defined]
        image_url=shop.image_url,  # type: ignore[attr-defined]
        is_approved=shop.is_approved,  # type: ignore[attr-defined]
        listing_count=agg.listing_count,
        latitude=float(shop.latitude) if shop.latitude is not None else None,  # type: ignore[attr-defined]
        longitude=float(shop.longitude) if shop.longitude is not None else None,  # type: ignore[attr-defined]
        distance_km=agg.distance_km,
        average_score=agg.average_score,
        review_count=agg.review_count,
        my_score=agg.my_score,
        is_favourite=agg.is_favourite,
    )


def shop_detail(shop: object, agg: ShopAggregates, my_review: object = None) -> ShopDetail:
    return ShopDetail(
        **shop_summary(shop, agg).model_dump(),
        my_review=my_review,  # type: ignore[arg-type]
        description=shop.description,  # type: ignore[attr-defined]
        address=shop.address,  # type: ignore[attr-defined]
        created_at=shop.created_at,  # type: ignore[attr-defined]
    )


def listing_out(row: object) -> Listing:
    return Listing(
        id=row.id,  # type: ignore[attr-defined]
        tea=TeaRef.model_validate(row.tea),  # type: ignore[attr-defined]
        pack_grams=float(row.pack_grams) if row.pack_grams is not None else None,  # type: ignore[attr-defined]
        price_minor=row.price_minor,  # type: ignore[attr-defined]
        currency=row.currency,  # type: ignore[attr-defined]
        product_url=row.product_url,  # type: ignore[attr-defined]
        is_available=row.is_available,  # type: ignore[attr-defined]
    )


def listing_with_shop(row: object, agg: ShopAggregates) -> ListingWithShop:
    return ListingWithShop(
        **listing_out(row).model_dump(),
        shop=shop_summary(row.shop, agg),  # type: ignore[attr-defined]
    )


# Resolves StockItem.shop, a forward reference for the same reason TeaDetail.my_review is.
StockItem.model_rebuild()
StockItemDetail.model_rebuild()

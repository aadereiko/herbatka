import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import Float, Select, and_, cast, func, select
from sqlalchemy import false as sa_false
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.models.household import HouseholdMember, StockEvent, StockItem
from app.models.preference import ShopReview
from app.models.shop import Shop, ShopListing
from app.models.user import User
from app.schemas.shop import (
    BuyRequest,
    ListingCreate,
    ListingUpdate,
    ShopAggregates,
    ShopCreate,
    ShopUpdate,
)
from app.services import geocoding
from app.services.catalog import _unique_slug
from app.services.errors import AlreadyExists, NotAMember, NotFound
from app.services.preference import favourite_shop_ids

_LISTING_LOADS = (selectinload(ShopListing.tea), selectinload(ShopListing.shop))


EARTH_RADIUS_KM = 6371.0088


def distance_km_expression(lat: float, lng: float):
    """Great-circle distance from a point to each shop, in kilometres.

    Haversine written out in SQL rather than PostGIS or the earthdistance extension:
    it needs nothing installed, it is exact enough for "which tea shop is nearest"
    (sub-metre over city distances), and it keeps the deployment to one plain Postgres.

    The cost is that it cannot use an index — every candidate row is computed. With
    tens of thousands of shops that would matter and the answer would be PostGIS with a
    GiST index; with a catalogue of tea shops it does not.
    """
    lat_radians = func.radians(cast(Shop.latitude, Float))
    lng_radians = func.radians(cast(Shop.longitude, Float))
    origin_lat = func.radians(lat)
    origin_lng = func.radians(lng)

    return EARTH_RADIUS_KM * (
        2
        * func.asin(
            func.sqrt(
                func.power(func.sin((lat_radians - origin_lat) / 2), 2)
                + func.cos(origin_lat)
                * func.cos(lat_radians)
                * func.power(func.sin((lng_radians - origin_lng) / 2), 2)
            )
        )
    )


def _rating_subquery():
    """One grouped pass over shop_review, joined once — the same shape the tea catalog
    uses, and for the same reason: a correlated AVG per row means one query per shop."""
    return (
        select(
            ShopReview.shop_id.label("shop_id"),
            func.avg(ShopReview.score).label("avg_score"),
            func.count(ShopReview.id).label("review_count"),
        )
        .group_by(ShopReview.shop_id)
        .subquery()
    )


def _with_extras(query: Select, viewer_id: uuid.UUID | None) -> Select:
    """Attach listing count, ratings, the viewer's own score and their star."""
    agg = _rating_subquery()
    mine = aliased(ShopReview)

    query = query.add_columns(
        listing_count_subquery().label("listing_count"),
        agg.c.avg_score,
        agg.c.review_count,
        mine.score.label("my_score"),
        Shop.id.in_(favourite_shop_ids(viewer_id)).label("is_favourite"),
    ).outerjoin(agg, agg.c.shop_id == Shop.id)

    if viewer_id is not None:
        query = query.outerjoin(mine, and_(mine.shop_id == Shop.id, mine.user_id == viewer_id))
    else:
        # Still selected, so the row shape does not depend on who is asking; an
        # impossible join condition keeps it NULL.
        query = query.outerjoin(mine, and_(mine.shop_id == Shop.id, sa_false()))
    return query


def _aggregates(row: object, distance_km: float | None = None) -> ShopAggregates:
    return ShopAggregates(
        listing_count=row.listing_count,  # type: ignore[attr-defined]
        distance_km=distance_km,
        average_score=(
            round(float(row.avg_score), 1) if row.avg_score is not None else None  # type: ignore[attr-defined]
        ),
        review_count=row.review_count or 0,  # type: ignore[attr-defined]
        my_score=row.my_score,  # type: ignore[attr-defined]
        is_favourite=bool(row.is_favourite),  # type: ignore[attr-defined]
    )


def listing_count_subquery():
    """How many teas a shop carries.

    .correlate(Shop) is load-bearing: without it, a query that also joins shop_listing
    would have that table auto-correlated out of the subquery, leaving it with no FROM
    clause. Same trap as the household counts.
    """
    return (
        select(func.count())
        .select_from(ShopListing)
        .where(ShopListing.shop_id == Shop.id)
        .correlate(Shop)
        .scalar_subquery()
    )


async def _paginate_shops(
    db: AsyncSession, query: Select, viewer_id: uuid.UUID | None, page: int, size: int
) -> tuple[list[tuple[Shop, ShopAggregates]], int]:
    # Counted before the extras are attached: they change the shape of a row, never how
    # many shops match.
    total = await db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    rows = await db.execute(_with_extras(query, viewer_id).offset((page - 1) * size).limit(size))
    return [(row[0], _aggregates(row)) for row in rows.unique().all()], total


async def list_shops(
    db: AsyncSession,
    *,
    q: str | None = None,
    city: str | None = None,
    country: str | None = None,
    #: `None` — everything, vouched for or not. Flipped from `True`: a suggested shop
    #: is listed the moment somebody proposes it and carries `is_approved` for the client
    #: to mark, rather than disappearing until an admin happens to look. The admin queue
    #: passes `False` to get the moderation list.
    approved: bool | None = None,
    near: tuple[float, float] | None = None,
    radius_km: float | None = None,
    viewer_id: uuid.UUID | None = None,
    favourites_only: bool = False,
    page: int = 1,
    size: int = 24,
) -> tuple[list[tuple[Shop, ShopAggregates]], int]:
    query = select(Shop)
    if approved is not None:
        query = query.where(Shop.is_approved.is_(approved))
    if q:
        query = query.where(Shop.name.ilike(f"%{q}%"))
    if city:
        query = query.where(Shop.city.ilike(city))
    if country:
        query = query.where(Shop.country.ilike(country))
    if favourites_only:
        query = query.where(Shop.id.in_(favourite_shop_ids(viewer_id)))

    if near is None:
        query = query.order_by(Shop.name)
        return await _paginate_shops(db, query, viewer_id, page, size)

    # A shop with no pin has no distance, so it cannot take part in a nearest-first
    # ordering at all. Excluded rather than sorted last: "nearest shops" that includes
    # ones whose location nobody knows is a worse answer than a shorter list.
    distance = distance_km_expression(*near).label("distance_km")
    query = query.where(Shop.latitude.is_not(None), Shop.longitude.is_not(None))
    if radius_km is not None:
        query = query.where(distance <= radius_km)

    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = await db.execute(
        _with_extras(query, viewer_id)
        .add_columns(distance)
        .order_by(distance)
        .offset((page - 1) * size)
        .limit(size)
    )
    return [
        (row[0], _aggregates(row, round(float(row.distance_km), 2))) for row in rows.unique().all()
    ], total


async def get_shop_by_slug(
    db: AsyncSession,
    slug: str,
    *,
    #: Default `True` — a shop is readable whether or not it has been vouched for, and
    #: `is_approved` on the response is what says which. Flipped along with the list
    #: default above; the pair used to hide a suggestion from the person who made it.
    include_unapproved: bool = True,
    viewer_id: uuid.UUID | None = None,
) -> tuple[Shop, ShopAggregates]:
    query = select(Shop).where(Shop.slug == slug)
    if not include_unapproved:
        query = query.where(Shop.is_approved.is_(True))
    row = (await db.execute(_with_extras(query, viewer_id))).unique().first()
    if row is None:
        raise NotFound("shop")
    return row[0], _aggregates(row)


async def get_shop(
    db: AsyncSession, shop_id: uuid.UUID, *, viewer_id: uuid.UUID | None = None
) -> tuple[Shop, ShopAggregates]:
    row = (
        (await db.execute(_with_extras(select(Shop).where(Shop.id == shop_id), viewer_id)))
        .unique()
        .first()
    )
    if row is None:
        raise NotFound("shop")
    return row[0], _aggregates(row)


async def create_shop(
    db: AsyncSession, payload: ShopCreate, *, created_by: User | None, approved: bool
) -> tuple[Shop, int]:
    shop = Shop(
        slug=await _unique_slug(db, Shop, payload.name),
        is_approved=approved,
        created_by_id=created_by.id if created_by else None,
        **payload.model_dump(),
    )
    db.add(shop)
    await db.flush()
    return await get_shop(db, shop.id)


async def update_shop(
    db: AsyncSession, shop_id: uuid.UUID, payload: ShopUpdate
) -> tuple[Shop, int]:
    shop = await db.get(Shop, shop_id)
    if shop is None:
        raise NotFound("shop")
    fields = payload.model_dump(exclude_unset=True)
    if "name" in fields and fields["name"] != shop.name:
        shop.slug = await _unique_slug(db, Shop, fields["name"], exclude_id=shop.id)
    for key, value in fields.items():
        setattr(shop, key, value)
    await db.flush()
    return await get_shop(db, shop_id)


async def approve_shop(db: AsyncSession, shop_id: uuid.UUID) -> tuple[Shop, int]:
    shop = await db.get(Shop, shop_id)
    if shop is None:
        raise NotFound("shop")
    shop.is_approved = True
    await db.flush()
    return await get_shop(db, shop_id)


async def delete_shop(db: AsyncSession, shop_id: uuid.UUID) -> None:
    shop = await db.get(Shop, shop_id)
    if shop is None:
        raise NotFound("shop")
    await db.delete(shop)
    await db.flush()


# -------------------------------------------------------------------------- listings


async def list_listings(
    db: AsyncSession, shop: Shop, *, page: int = 1, size: int = 24
) -> tuple[list[ShopListing], int]:
    base = select(ShopListing).where(ShopListing.shop_id == shop.id)
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = await db.scalars(
        base.options(*_LISTING_LOADS)
        .join(ShopListing.tea)
        .order_by(ShopListing.is_available.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    return list(rows.unique()), total


async def listings_for_tea(
    db: AsyncSession,
    tea_id: uuid.UUID,
    *,
    viewer_id: uuid.UUID | None = None,
    page: int = 1,
    size: int = 24,
) -> tuple[list[tuple[ShopListing, ShopAggregates]], int]:
    """Where to buy a given tea, including shops nobody has vouched for yet.

    It used to be approved-only, on the argument that pointing people at an unreviewed
    shop sidesteps the review. That argument went with the change: a suggested shop is
    part of the catalog now, marked rather than hidden, and a listing that exists but is
    invisible on the one page it answers a question for is worse than a marked one.
    """
    base = select(ShopListing).join(ShopListing.shop).where(ShopListing.tea_id == tea_id)
    total = await db.scalar(select(func.count()).select_from(base.order_by(None).subquery())) or 0
    rows = await db.execute(
        _with_extras(base.options(*_LISTING_LOADS), viewer_id)
        .order_by(ShopListing.is_available.desc(), Shop.name)
        .offset((page - 1) * size)
        .limit(size)
    )
    return [(row[0], _aggregates(row)) for row in rows.unique().all()], total


async def get_listing(db: AsyncSession, shop: Shop, listing_id: uuid.UUID) -> ShopListing:
    listing = await db.scalar(
        select(ShopListing)
        .options(*_LISTING_LOADS)
        .where(ShopListing.id == listing_id, ShopListing.shop_id == shop.id)
    )
    if listing is None:
        raise NotFound("listing")
    return listing


async def create_listing(
    db: AsyncSession, shop_id: uuid.UUID, payload: ListingCreate
) -> ShopListing:
    from app.models.catalog import Tea

    if await db.get(Shop, shop_id) is None:
        raise NotFound("shop")
    if await db.get(Tea, payload.tea_id) is None:
        raise NotFound("tea")

    pack = Decimal(str(payload.pack_grams)) if payload.pack_grams is not None else None
    clash = await db.scalar(
        select(ShopListing).where(
            ShopListing.shop_id == shop_id,
            ShopListing.tea_id == payload.tea_id,
            ShopListing.pack_grams.is_(None) if pack is None else ShopListing.pack_grams == pack,
        )
    )
    if clash is not None:
        raise AlreadyExists("listing")

    listing = ShopListing(shop_id=shop_id, **payload.model_dump())
    db.add(listing)
    await db.flush()
    return await db.scalar(
        select(ShopListing).options(*_LISTING_LOADS).where(ShopListing.id == listing.id)
    )  # type: ignore[return-value]


async def update_listing(
    db: AsyncSession, shop_id: uuid.UUID, listing_id: uuid.UUID, payload: ListingUpdate
) -> ShopListing:
    listing = await db.scalar(
        select(ShopListing).where(ShopListing.id == listing_id, ShopListing.shop_id == shop_id)
    )
    if listing is None:
        raise NotFound("listing")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(listing, key, Decimal(str(value)) if key == "pack_grams" and value else value)
    await db.flush()
    return await db.scalar(
        select(ShopListing).options(*_LISTING_LOADS).where(ShopListing.id == listing_id)
    )  # type: ignore[return-value]


async def delete_listing(db: AsyncSession, shop_id: uuid.UUID, listing_id: uuid.UUID) -> None:
    listing = await db.scalar(
        select(ShopListing).where(ShopListing.id == listing_id, ShopListing.shop_id == shop_id)
    )
    if listing is None:
        raise NotFound("listing")
    await db.delete(listing)
    await db.flush()


# ------------------------------------------------------------------------------ buying


async def buy(
    db: AsyncSession, shop: Shop, listing: ShopListing, payload: BuyRequest, buyer: User
) -> StockItem:
    """Record a purchase: put the tea on a household's shelf, tagged with the shop.

    No money moves. This is a tracker — the shop's own site handles the transaction, and
    what lands here is the record of it.

    An existing tin is topped up only when it is the same tea *from the same shop*.
    Merging a pack from one shop into a tin from another would quietly destroy the
    answer to "where did this come from", which is the whole point of the feature.
    """
    membership = await db.get(HouseholdMember, (payload.household_id, buyer.id))
    if membership is None:
        raise NotAMember(str(payload.household_id))

    grams = Decimal(str(payload.grams)).quantize(Decimal("0.01"))

    item = await db.scalar(
        select(StockItem).where(
            StockItem.household_id == payload.household_id,
            StockItem.tea_id == listing.tea_id,
            StockItem.shop_id == shop.id,
        )
    )
    if item is None:
        item = StockItem(
            household_id=payload.household_id,
            tea_id=listing.tea_id,
            shop_id=shop.id,
            quantity_grams=Decimal(0),
            added_by_id=buyer.id,
            purchased_at=payload.purchased_at,
            price_paid_minor=payload.price_paid_minor,
            currency=payload.currency,
        )
        db.add(item)
        await db.flush()

    db.add(
        StockEvent(
            stock_item_id=item.id,
            user_id=buyer.id,
            kind="purchase",
            delta_grams=grams,
            occurred_at=datetime.now(UTC),
            note=f"Bought at {shop.name}",
            shop_id=shop.id,
            price_paid_minor=payload.price_paid_minor,
            currency=payload.currency,
        )
    )
    item.quantity_grams = (item.quantity_grams + grams).quantize(Decimal("0.01"))
    await db.flush()

    fresh = await db.scalar(
        select(StockItem)
        .options(selectinload(StockItem.tea), selectinload(StockItem.shop))
        .where(StockItem.id == item.id)
    )
    assert fresh is not None
    return fresh


async def geocode_shop(db: AsyncSession, shop_id: uuid.UUID) -> tuple[Shop, int]:
    """Look the shop's written address up and move its pin to the result.

    Deliberately a separate, explicit action rather than something that happens quietly
    on every save. Geocoding is a guess — "Rynek 7" exists in a dozen Polish towns — so
    an admin asks for it, sees where the pin landed, and drags it if it is wrong.
    """
    shop = await db.get(Shop, shop_id)
    if shop is None:
        raise NotFound("shop")

    point = await geocoding.lookup(shop.address, shop.city, shop.country)
    shop.latitude = point.latitude
    shop.longitude = point.longitude
    shop.geocoded_at = datetime.now(UTC)
    await db.flush()
    return await get_shop(db, shop_id)

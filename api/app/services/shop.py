import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import Float, Select, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.household import HouseholdMember, StockEvent, StockItem
from app.models.shop import Shop, ShopListing
from app.models.user import User
from app.schemas.shop import BuyRequest, ListingCreate, ListingUpdate, ShopCreate, ShopUpdate
from app.services import geocoding
from app.services.catalog import _unique_slug
from app.services.errors import AlreadyExists, NotAMember, NotFound

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
    db: AsyncSession, query: Select, page: int, size: int
) -> tuple[list[tuple[Shop, int]], int]:
    total = await db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    rows = await db.execute(
        query.add_columns(listing_count_subquery().label("listing_count"))
        .offset((page - 1) * size)
        .limit(size)
    )
    return [(row[0], row.listing_count) for row in rows.unique().all()], total


async def list_shops(
    db: AsyncSession,
    *,
    q: str | None = None,
    city: str | None = None,
    country: str | None = None,
    approved: bool | None = True,
    near: tuple[float, float] | None = None,
    radius_km: float | None = None,
    page: int = 1,
    size: int = 24,
) -> tuple[list[tuple[Shop, int, float | None]], int]:
    query = select(Shop)
    if approved is not None:
        query = query.where(Shop.is_approved.is_(approved))
    if q:
        query = query.where(Shop.name.ilike(f"%{q}%"))
    if city:
        query = query.where(Shop.city.ilike(city))
    if country:
        query = query.where(Shop.country.ilike(country))

    if near is None:
        query = query.order_by(Shop.name)
        rows, total = await _paginate_shops(db, query, page, size)
        return [(shop, count, None) for shop, count in rows], total

    # A shop with no pin has no distance, so it cannot take part in a nearest-first
    # ordering at all. Excluded rather than sorted last: "nearest shops" that includes
    # ones whose location nobody knows is a worse answer than a shorter list.
    distance = distance_km_expression(*near).label("distance_km")
    query = query.where(Shop.latitude.is_not(None), Shop.longitude.is_not(None))
    if radius_km is not None:
        query = query.where(distance <= radius_km)

    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = await db.execute(
        query.add_columns(listing_count_subquery().label("listing_count"), distance)
        .order_by(distance)
        .offset((page - 1) * size)
        .limit(size)
    )
    return [
        (row[0], row.listing_count, round(float(row.distance_km), 2)) for row in rows.unique().all()
    ], total


async def get_shop_by_slug(
    db: AsyncSession, slug: str, *, include_unapproved: bool = False
) -> tuple[Shop, int]:
    query = select(Shop).where(Shop.slug == slug)
    if not include_unapproved:
        query = query.where(Shop.is_approved.is_(True))
    row = (
        await db.execute(query.add_columns(listing_count_subquery().label("listing_count")))
    ).first()
    if row is None:
        raise NotFound("shop")
    return row[0], row.listing_count


async def get_shop(db: AsyncSession, shop_id: uuid.UUID) -> tuple[Shop, int]:
    row = (
        await db.execute(
            select(Shop)
            .where(Shop.id == shop_id)
            .add_columns(listing_count_subquery().label("listing_count"))
        )
    ).first()
    if row is None:
        raise NotFound("shop")
    return row[0], row.listing_count


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
    db: AsyncSession, tea_id: uuid.UUID, *, page: int = 1, size: int = 24
) -> tuple[list[tuple[ShopListing, int]], int]:
    """Where to buy a given tea. Only approved shops — an unapproved one is not yet part
    of the shared catalog, and pointing people at it would sidestep the review."""
    base = (
        select(ShopListing)
        .join(ShopListing.shop)
        .where(ShopListing.tea_id == tea_id, Shop.is_approved.is_(True))
    )
    total = await db.scalar(select(func.count()).select_from(base.order_by(None).subquery())) or 0
    rows = await db.execute(
        base.options(*_LISTING_LOADS)
        .add_columns(listing_count_subquery().label("listing_count"))
        .order_by(ShopListing.is_available.desc(), Shop.name)
        .offset((page - 1) * size)
        .limit(size)
    )
    return [(row[0], row.listing_count) for row in rows.unique().all()], total


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

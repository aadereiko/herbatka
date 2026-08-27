import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, UploadFile, status

from app.api.deps import CurrentUser, DbSession, OptionalUser, PageParams
from app.schemas.common import Page
from app.schemas.household import StockItemDetail, stock_item_detail
from app.schemas.preference import ShopReview as ShopReviewOut
from app.schemas.preference import ShopReviewInput, shop_review
from app.schemas.shop import (
    BuyRequest,
    Listing,
    ListingWithShop,
    ShopCreate,
    ShopDetail,
    ShopSummary,
    UploadedImage,
    listing_out,
    listing_with_shop,
    shop_detail,
    shop_summary,
)
from app.services import preference as preference_service
from app.services import shop as shop_service
from app.services import stock as stock_service
from app.services.errors import NotAMember, NotFound
from app.services.images import ImageTooLarge, NotAnImage, store

router = APIRouter(tags=["shops"])


def _no_shop() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shop not found")


@router.get("/shops", response_model=Page[ShopSummary])
async def list_shops(
    db: DbSession,
    paging: PageParams,
    viewer: OptionalUser,
    q: Annotated[str | None, Query(max_length=120)] = None,
    city: Annotated[str | None, Query(max_length=120)] = None,
    country: Annotated[str | None, Query(max_length=60)] = None,
    near_lat: Annotated[float | None, Query(ge=-90, le=90)] = None,
    near_lng: Annotated[float | None, Query(ge=-180, le=180)] = None,
    radius_km: Annotated[float | None, Query(gt=0, le=20000)] = None,
) -> Page[ShopSummary]:
    """Public, like the tea catalog: you can see where to buy tea without an account.

    A position sorts the results nearest-first. It is read from the query and used for
    that one comparison — never written to the database and never logged. Where somebody
    is standing is not this app's business beyond answering the question they asked.
    """
    if (near_lat is None) != (near_lng is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="near_lat and near_lng must be given together",
        )

    rows, total = await shop_service.list_shops(
        db,
        q=q,
        city=city,
        country=country,
        near=(near_lat, near_lng) if near_lat is not None and near_lng is not None else None,
        radius_km=radius_km,
        viewer_id=viewer.id if viewer else None,
        page=paging.page,
        size=paging.size,
    )
    return Page.build([shop_summary(s, a) for s, a in rows], total, paging.page, paging.size)


@router.get("/shops/{slug}", response_model=ShopDetail)
async def get_shop(slug: str, db: DbSession, viewer: OptionalUser) -> ShopDetail:
    try:
        shop, agg = await shop_service.get_shop_by_slug(
            db, slug, viewer_id=viewer.id if viewer else None
        )
    except NotFound as exc:
        raise _no_shop() from exc

    mine = await preference_service.get_my_shop_review(db, shop.id, viewer.id) if viewer else None
    return shop_detail(shop, agg, shop_review(mine) if mine else None)


@router.get("/shops/{slug}/listings", response_model=Page[Listing])
async def list_listings(slug: str, db: DbSession, paging: PageParams) -> Page[Listing]:
    try:
        shop, _ = await shop_service.get_shop_by_slug(db, slug)
    except NotFound as exc:
        raise _no_shop() from exc
    rows, total = await shop_service.list_listings(db, shop, page=paging.page, size=paging.size)
    return Page.build([listing_out(r) for r in rows], total, paging.page, paging.size)


@router.post("/shops", response_model=ShopDetail, status_code=status.HTTP_201_CREATED)
async def suggest_shop(payload: ShopCreate, user: CurrentUser, db: DbSession) -> ShopDetail:
    """A signed-in user proposes a shop; it stays invisible until an admin approves it."""
    shop, count = await shop_service.create_shop(db, payload, created_by=user, approved=False)
    return shop_detail(shop, count)


@router.post(
    "/shops/{slug}/listings/{listing_id}/buy",
    response_model=StockItemDetail,
    status_code=status.HTTP_201_CREATED,
)
async def buy_listing(
    slug: str,
    listing_id: uuid.UUID,
    payload: BuyRequest,
    user: CurrentUser,
    db: DbSession,
) -> StockItemDetail:
    """Record a purchase. No payment happens here — the shop's own site does that."""
    try:
        shop, _ = await shop_service.get_shop_by_slug(db, slug)
        listing = await shop_service.get_listing(db, shop, listing_id)
        item = await shop_service.buy(db, shop, listing, payload, user)
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No such {exc}") from exc
    except NotAMember as exc:
        # 403, not the 404 a household route would give: the caller named this household
        # themselves, so its existence is not what is being protected here.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of that household",
        ) from exc

    events = await stock_service.recent_events(db, item.id)
    return stock_item_detail(item, events)


@router.get("/catalog/teas/{slug}/shops", response_model=Page[ListingWithShop])
async def where_to_buy(slug: str, db: DbSession, paging: PageParams) -> Page[ListingWithShop]:
    from app.services import catalog as catalog_service

    try:
        tea, _ = await catalog_service.get_tea_by_slug(db, slug)
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tea not found") from exc

    rows, total = await shop_service.listings_for_tea(
        db, tea.id, page=paging.page, size=paging.size
    )
    return Page.build([listing_with_shop(r, n) for r, n in rows], total, paging.page, paging.size)


@router.post("/uploads/image", response_model=UploadedImage, status_code=status.HTTP_201_CREATED)
async def upload_image(file: UploadFile, _: CurrentUser) -> UploadedImage:
    """Store an image and hand back the URL it is served at.

    Signed-in only: an open upload endpoint is free hosting for anybody who finds it.
    """
    data = await file.read()
    try:
        return UploadedImage(url=store(data))
    except ImageTooLarge as exc:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Images must be 5 MB or smaller",
        ) from exc
    except NotAnImage as exc:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="That file is not a JPEG, PNG or WebP image",
        ) from exc


# ------------------------------------------------------------------- shop reviews


@router.get("/shops/{slug}/reviews", response_model=Page[ShopReviewOut])
async def list_shop_reviews(slug: str, db: DbSession, paging: PageParams) -> Page[ShopReviewOut]:
    """Public: you can read what people think of a shop before making an account."""
    try:
        shop, _ = await shop_service.get_shop_by_slug(db, slug)
    except NotFound as exc:
        raise _no_shop() from exc
    reviews, total = await preference_service.list_shop_reviews(
        db, shop.id, page=paging.page, size=paging.size
    )
    return Page.build([shop_review(r) for r in reviews], total, paging.page, paging.size)


@router.put("/shops/{slug}/review", response_model=ShopReviewOut)
async def write_shop_review(
    slug: str, payload: ShopReviewInput, user: CurrentUser, db: DbSession
) -> ShopReviewOut:
    """PUT, like the tea review: one opinion per person per shop, so writing it is
    idempotent and the client never has to choose between create and update."""
    try:
        shop, _ = await shop_service.get_shop_by_slug(db, slug)
    except NotFound as exc:
        raise _no_shop() from exc
    return shop_review(await preference_service.upsert_shop_review(db, shop.id, payload, user))


@router.delete("/shops/{slug}/review", status_code=status.HTTP_204_NO_CONTENT)
async def delete_shop_review(slug: str, user: CurrentUser, db: DbSession) -> None:
    try:
        shop, _ = await shop_service.get_shop_by_slug(db, slug)
        await preference_service.delete_shop_review(db, shop.id, user.id)
    except NotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="You have not rated that shop"
        ) from exc


# --------------------------------------------------------------------- favourites


@router.put("/shops/{slug}/favourite", status_code=status.HTTP_204_NO_CONTENT)
async def favourite_shop(slug: str, user: CurrentUser, db: DbSession) -> None:
    """Idempotent: starring twice is the same as starring once. A double tap on a phone
    should not be a 409."""
    try:
        shop, _ = await shop_service.get_shop_by_slug(db, slug)
    except NotFound as exc:
        raise _no_shop() from exc
    await preference_service.set_favourite_shop(db, user.id, shop.id, on=True)


@router.delete("/shops/{slug}/favourite", status_code=status.HTTP_204_NO_CONTENT)
async def unfavourite_shop(slug: str, user: CurrentUser, db: DbSession) -> None:
    try:
        shop, _ = await shop_service.get_shop_by_slug(db, slug)
    except NotFound as exc:
        raise _no_shop() from exc
    await preference_service.set_favourite_shop(db, user.id, shop.id, on=False)

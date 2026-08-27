import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import AdminUser, DbSession, PageParams, get_current_admin
from app.schemas.catalog import (
    BrandCreate,
    BrandOut,
    BrandUpdate,
    IngredientCreate,
    IngredientOut,
    IngredientUpdate,
    TeaCreate,
    TeaDetail,
    TeaSummary,
    TeaUpdate,
    tea_detail,
    tea_summary,
)
from app.schemas.common import Page
from app.schemas.shop import (
    Listing,
    ListingCreate,
    ListingUpdate,
    ShopCreate,
    ShopDetail,
    ShopSummary,
    ShopUpdate,
    listing_out,
    shop_detail,
    shop_summary,
)
from app.services import catalog as catalog_service
from app.services import shop as shop_service
from app.services.errors import AlreadyExists, IngredientInUse, NotFound
from app.services.geocoding import AddressNotFound, GeocodingUnavailable

# AdminUser is declared as a router-wide dependency rather than per route: a new
# endpoint added here is protected by default, instead of being public until somebody
# notices the missing parameter.
router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(get_current_admin)],
)


def _not_found(exc: NotFound) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No such {exc}")


# ------------------------------------------------------------------------------ teas


@router.get("/teas", response_model=Page[TeaSummary])
async def list_teas(
    db: DbSession,
    paging: PageParams,
    approved: Annotated[bool | None, Query()] = None,
) -> Page[TeaSummary]:
    """Unlike the public list, this can show unapproved teas — the moderation queue."""
    teas, total = await catalog_service.list_teas(
        db, approved=approved, page=paging.page, size=paging.size
    )
    return Page.build(
        [tea_summary(tea, ratings) for tea, ratings in teas], total, paging.page, paging.size
    )


@router.post("/teas", response_model=TeaDetail, status_code=status.HTTP_201_CREATED)
async def create_tea(payload: TeaCreate, admin: AdminUser, db: DbSession) -> TeaDetail:
    try:
        tea, ratings = await catalog_service.create_tea(
            db, payload, created_by=admin, approved=True
        )
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return tea_detail(tea, ratings)


@router.patch("/teas/{tea_id}", response_model=TeaDetail)
async def update_tea(tea_id: uuid.UUID, payload: TeaUpdate, db: DbSession) -> TeaDetail:
    try:
        return tea_detail(*await catalog_service.update_tea(db, tea_id, payload))
    except NotFound as exc:
        raise _not_found(exc) from exc


@router.post("/teas/{tea_id}/approve", response_model=TeaDetail)
async def approve_tea(tea_id: uuid.UUID, db: DbSession) -> TeaDetail:
    try:
        return tea_detail(*await catalog_service.approve_tea(db, tea_id))
    except NotFound as exc:
        raise _not_found(exc) from exc


@router.delete("/teas/{tea_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tea(tea_id: uuid.UUID, db: DbSession) -> None:
    try:
        await catalog_service.delete_tea(db, tea_id)
    except NotFound as exc:
        raise _not_found(exc) from exc


# ---------------------------------------------------------------------- ingredients


@router.post("/ingredients", response_model=IngredientOut, status_code=status.HTTP_201_CREATED)
async def create_ingredient(payload: IngredientCreate, db: DbSession) -> IngredientOut:
    return IngredientOut.model_validate(await catalog_service.create_ingredient(db, payload))


@router.patch("/ingredients/{ingredient_id}", response_model=IngredientOut)
async def update_ingredient(
    ingredient_id: uuid.UUID, payload: IngredientUpdate, db: DbSession
) -> IngredientOut:
    try:
        updated = await catalog_service.update_ingredient(db, ingredient_id, payload)
    except NotFound as exc:
        raise _not_found(exc) from exc
    return IngredientOut.model_validate(updated)


@router.delete("/ingredients/{ingredient_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ingredient(ingredient_id: uuid.UUID, db: DbSession) -> None:
    try:
        await catalog_service.delete_ingredient(db, ingredient_id)
    except NotFound as exc:
        raise _not_found(exc) from exc
    except IngredientInUse as exc:
        # 409, not 500 from the FK's ON DELETE RESTRICT, and the message says how many
        # teas are in the way so the admin knows what to fix.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"This ingredient is used by {exc} tea(s). "
                "Remove it from those teas before deleting it."
            ),
        ) from exc


# ---------------------------------------------------------------------------- brands


@router.post("/brands", response_model=BrandOut, status_code=status.HTTP_201_CREATED)
async def create_brand(payload: BrandCreate, db: DbSession) -> BrandOut:
    return BrandOut.model_validate(await catalog_service.create_brand(db, payload))


@router.patch("/brands/{brand_id}", response_model=BrandOut)
async def update_brand(brand_id: uuid.UUID, payload: BrandUpdate, db: DbSession) -> BrandOut:
    try:
        return BrandOut.model_validate(await catalog_service.update_brand(db, brand_id, payload))
    except NotFound as exc:
        raise _not_found(exc) from exc


@router.delete("/brands/{brand_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_brand(brand_id: uuid.UUID, db: DbSession) -> None:
    try:
        await catalog_service.delete_brand(db, brand_id)
    except NotFound as exc:
        raise _not_found(exc) from exc


# ---------------------------------------------------------------------------- shops


@router.get("/shops", response_model=Page[ShopSummary])
async def list_shops(
    db: DbSession, paging: PageParams, approved: Annotated[bool | None, Query()] = None
) -> Page[ShopSummary]:
    """Unlike the public list, this can show unapproved shops — the moderation queue."""
    rows, total = await shop_service.list_shops(
        db, approved=approved, page=paging.page, size=paging.size
    )
    return Page.build([shop_summary(s, n, d) for s, n, d in rows], total, paging.page, paging.size)


@router.get("/shops/{shop_id}", response_model=ShopDetail)
async def get_shop(shop_id: uuid.UUID, db: DbSession) -> ShopDetail:
    """The full record regardless of approval.

    The public GET /shops/{slug} deliberately hides unapproved shops, which left the
    moderation queue unable to show `address` or `description` — so an edit form built
    from the queue's summary would have PATCHed both to null. An admin needs to read
    what they are approving.
    """
    try:
        return shop_detail(*await shop_service.get_shop(db, shop_id))
    except NotFound as exc:
        raise _not_found(exc) from exc


@router.post("/shops", response_model=ShopDetail, status_code=status.HTTP_201_CREATED)
async def create_shop(payload: ShopCreate, admin: AdminUser, db: DbSession) -> ShopDetail:
    shop, count = await shop_service.create_shop(db, payload, created_by=admin, approved=True)
    return shop_detail(shop, count)


@router.patch("/shops/{shop_id}", response_model=ShopDetail)
async def update_shop(shop_id: uuid.UUID, payload: ShopUpdate, db: DbSession) -> ShopDetail:
    try:
        return shop_detail(*await shop_service.update_shop(db, shop_id, payload))
    except NotFound as exc:
        raise _not_found(exc) from exc


@router.post("/shops/{shop_id}/approve", response_model=ShopDetail)
async def approve_shop(shop_id: uuid.UUID, db: DbSession) -> ShopDetail:
    try:
        return shop_detail(*await shop_service.approve_shop(db, shop_id))
    except NotFound as exc:
        raise _not_found(exc) from exc


@router.delete("/shops/{shop_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_shop(shop_id: uuid.UUID, db: DbSession) -> None:
    try:
        await shop_service.delete_shop(db, shop_id)
    except NotFound as exc:
        raise _not_found(exc) from exc


@router.post(
    "/shops/{shop_id}/listings", response_model=Listing, status_code=status.HTTP_201_CREATED
)
async def create_listing(shop_id: uuid.UUID, payload: ListingCreate, db: DbSession) -> Listing:
    try:
        return listing_out(await shop_service.create_listing(db, shop_id, payload))
    except NotFound as exc:
        raise _not_found(exc) from exc
    except AlreadyExists as exc:
        # Checked in the service, so this is a 409 naming the clash rather than a 500
        # from uq_listing_shop_tea_pack. The constraint stays as the net.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This shop already lists that tea at that pack size",
        ) from exc


@router.patch("/shops/{shop_id}/listings/{listing_id}", response_model=Listing)
async def update_listing(
    shop_id: uuid.UUID, listing_id: uuid.UUID, payload: ListingUpdate, db: DbSession
) -> Listing:
    try:
        return listing_out(await shop_service.update_listing(db, shop_id, listing_id, payload))
    except NotFound as exc:
        raise _not_found(exc) from exc


@router.delete("/shops/{shop_id}/listings/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_listing(shop_id: uuid.UUID, listing_id: uuid.UUID, db: DbSession) -> None:
    try:
        await shop_service.delete_listing(db, shop_id, listing_id)
    except NotFound as exc:
        raise _not_found(exc) from exc


@router.post("/shops/{shop_id}/geocode", response_model=ShopDetail)
async def geocode_shop(shop_id: uuid.UUID, db: DbSession) -> ShopDetail:
    """Set the pin from the written address. The admin can still drag it afterwards."""
    try:
        return shop_detail(*await shop_service.geocode_shop(db, shop_id))
    except NotFound as exc:
        raise _not_found(exc) from exc
    except AddressNotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="We could not find that address. Drop the pin on the map instead.",
        ) from exc
    except GeocodingUnavailable as exc:
        # 503, not 422: nothing is wrong with the address, the lookup service is simply
        # not answering — and the caller may reasonably try again later.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Address lookup is unavailable right now. Drop the pin on the map instead.",
        ) from exc

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
from app.services import catalog as catalog_service
from app.services.errors import IngredientInUse, NotFound

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

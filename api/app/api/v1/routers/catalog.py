from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUser, DbSession, PageParams
from app.schemas.catalog import (
    BrandOut,
    IngredientCategory,
    IngredientOut,
    TeaCreate,
    TeaDetail,
    TeaSummary,
    TeaType,
    tea_detail,
    tea_summary,
)
from app.schemas.common import Page
from app.services import catalog as catalog_service
from app.services.errors import NotFound

router = APIRouter(prefix="/catalog", tags=["catalog"])

# Anonymous browsing is deliberate: someone should be able to look a tea up and read its
# ingredients before deciding whether the app is worth an account.


@router.get("/teas", response_model=Page[TeaSummary])
async def list_teas(
    db: DbSession,
    paging: PageParams,
    q: Annotated[str | None, Query(max_length=120)] = None,
    tea_type: TeaType | None = None,
    ingredient: Annotated[str | None, Query(max_length=120)] = None,
    brand: Annotated[str | None, Query(max_length=120)] = None,
) -> Page[TeaSummary]:
    teas, total = await catalog_service.list_teas(
        db,
        q=q,
        tea_type=tea_type,
        ingredient_slug=ingredient,
        brand_slug=brand,
        approved=True,
        page=paging.page,
        size=paging.size,
    )
    return Page.build([tea_summary(t) for t in teas], total, paging.page, paging.size)


@router.get("/teas/{slug}", response_model=TeaDetail)
async def get_tea(slug: str, db: DbSession) -> TeaDetail:
    try:
        tea = await catalog_service.get_tea_by_slug(db, slug)
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tea not found") from exc
    return tea_detail(tea)


@router.post("/teas", response_model=TeaDetail, status_code=status.HTTP_201_CREATED)
async def submit_tea(payload: TeaCreate, user: CurrentUser, db: DbSession) -> TeaDetail:
    """A signed-in user proposes a tea; it stays invisible until an admin approves it."""
    try:
        tea = await catalog_service.create_tea(db, payload, created_by=user, approved=False)
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return tea_detail(tea)


@router.get("/ingredients", response_model=Page[IngredientOut])
async def list_ingredients(
    db: DbSession,
    paging: PageParams,
    q: Annotated[str | None, Query(max_length=120)] = None,
    category: IngredientCategory | None = None,
) -> Page[IngredientOut]:
    items, total = await catalog_service.list_ingredients(db, q, category, paging.page, paging.size)
    return Page.build(
        [IngredientOut.model_validate(i) for i in items], total, paging.page, paging.size
    )


@router.get("/brands", response_model=Page[BrandOut])
async def list_brands(
    db: DbSession,
    paging: PageParams,
    q: Annotated[str | None, Query(max_length=120)] = None,
) -> Page[BrandOut]:
    items, total = await catalog_service.list_brands(db, q, paging.page, paging.size)
    return Page.build([BrandOut.model_validate(b) for b in items], total, paging.page, paging.size)

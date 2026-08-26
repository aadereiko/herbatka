from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUser, DbSession, OptionalUser, PageParams
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
from app.schemas.review import Review, ReviewInput, review_out
from app.services import catalog as catalog_service
from app.services import review as review_service
from app.services.errors import NotFound

router = APIRouter(prefix="/catalog", tags=["catalog"])

# Anonymous browsing is deliberate: someone should be able to look a tea up and read its
# ingredients before deciding whether the app is worth an account.


@router.get("/teas", response_model=Page[TeaSummary])
async def list_teas(
    db: DbSession,
    paging: PageParams,
    viewer: OptionalUser,
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
        viewer_id=viewer.id if viewer else None,
        page=paging.page,
        size=paging.size,
    )
    return Page.build(
        [tea_summary(tea, ratings) for tea, ratings in teas], total, paging.page, paging.size
    )


@router.get("/teas/{slug}", response_model=TeaDetail)
async def get_tea(slug: str, db: DbSession, viewer: OptionalUser) -> TeaDetail:
    try:
        tea, ratings = await catalog_service.get_tea_by_slug(
            db, slug, viewer_id=viewer.id if viewer else None
        )
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tea not found") from exc

    mine = await review_service.get_mine(db, tea.id, viewer.id) if viewer else None
    return tea_detail(tea, ratings, review_out(mine) if mine else None)


@router.post("/teas", response_model=TeaDetail, status_code=status.HTTP_201_CREATED)
async def submit_tea(payload: TeaCreate, user: CurrentUser, db: DbSession) -> TeaDetail:
    """A signed-in user proposes a tea; it stays invisible until an admin approves it."""
    try:
        tea, ratings = await catalog_service.create_tea(
            db, payload, created_by=user, approved=False
        )
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return tea_detail(tea, ratings)


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


# ------------------------------------------------------------------------- reviews


@router.get("/teas/{slug}/reviews", response_model=Page[Review])
async def list_reviews(slug: str, db: DbSession, paging: PageParams) -> Page[Review]:
    """Public: you can read what people think before deciding to make an account."""
    try:
        reviews, total = await review_service.list_for_tea(
            db, slug, page=paging.page, size=paging.size
        )
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tea not found") from exc
    return Page.build([review_out(r) for r in reviews], total, paging.page, paging.size)


@router.put("/teas/{slug}/review", response_model=Review)
async def write_review(slug: str, payload: ReviewInput, user: CurrentUser, db: DbSession) -> Review:
    """PUT, not POST: one review per person per tea, so writing it is idempotent."""
    try:
        return review_out(await review_service.upsert(db, slug, payload, user))
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tea not found") from exc


@router.delete("/teas/{slug}/review", status_code=status.HTTP_204_NO_CONTENT)
async def delete_review(slug: str, user: CurrentUser, db: DbSession) -> None:
    try:
        await review_service.delete_mine(db, slug, user.id)
    except NotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="You have not reviewed that tea"
        ) from exc

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession, PageParams
from app.schemas.catalog import TeaSummary, tea_summary
from app.schemas.common import Page
from app.schemas.shop import ShopSummary, shop_summary
from app.services import catalog as catalog_service
from app.services import shop as shop_service

# No prefix, and its own module. These two lists belong to *you*, not to the catalog or
# to shops — and hanging them off the catalog router silently put them at
# /catalog/favourites/teas, which is not the documented path.
router = APIRouter(prefix="/favourites", tags=["favourites"])


@router.get("/teas", response_model=Page[TeaSummary])
async def my_favourite_teas(
    user: CurrentUser, db: DbSession, paging: PageParams
) -> Page[TeaSummary]:
    teas, total = await catalog_service.list_teas(
        db, viewer_id=user.id, favourites_only=True, page=paging.page, size=paging.size
    )
    return Page.build(
        [tea_summary(tea, ratings) for tea, ratings in teas], total, paging.page, paging.size
    )


@router.get("/shops", response_model=Page[ShopSummary])
async def my_favourite_shops(
    user: CurrentUser, db: DbSession, paging: PageParams
) -> Page[ShopSummary]:
    rows, total = await shop_service.list_shops(
        db, viewer_id=user.id, favourites_only=True, page=paging.page, size=paging.size
    )
    return Page.build([shop_summary(s, a) for s, a in rows], total, paging.page, paging.size)

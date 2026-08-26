from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession, PageParams
from app.schemas.common import Page
from app.schemas.review import MyReview, my_review_out
from app.services import review as review_service

router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.get("/mine", response_model=Page[MyReview])
async def list_my_reviews(user: CurrentUser, db: DbSession, paging: PageParams) -> Page[MyReview]:
    """Your own reviews, each carrying the tea it belongs to.

    Not served from /catalog: this is a view of *you*, and it spans every tea rather
    than living under one of them.
    """
    reviews, total = await review_service.list_mine(db, user.id, page=paging.page, size=paging.size)
    return Page.build([my_review_out(r) for r in reviews], total, paging.page, paging.size)

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.api.v1.routers.friends import _feed_items
from app.schemas.catalog import tea_summary
from app.schemas.friend import HouseholdRef
from app.schemas.home import HomeSummary, LowTin, PublicSummary
from app.schemas.household import stock_item, stock_pace
from app.services import feed as feed_service
from app.services import home as home_service

router = APIRouter(tags=["home"])


@router.get("/home", response_model=HomeSummary)
async def home(user: CurrentUser, db: DbSession) -> HomeSummary:
    """One request for the whole signed-in landing page."""
    entries, _ = await feed_service.page(db, user.id, page=1, size=home_service.ACTIVITY_LIMIT)

    return HomeSummary(
        display_name=user.display_name,
        **await home_service.counts(db, user.id),
        low_stock=[
            LowTin(
                item=stock_item(item),
                household=HouseholdRef.model_validate(household),
                pace=stock_pace(pace) if pace is not None else None,
            )
            for item, household, pace in await home_service.low_tins(db, user.id)
        ],
        recent_activity=_feed_items(entries),
        unrated=[
            tea_summary(tea, r)
            for tea, r in await home_service.unrated_on_your_shelves(db, user.id)
        ],
    )


@router.get("/home/public", response_model=PublicSummary)
async def public_home(db: DbSession) -> PublicSummary:
    """What a signed-out visitor sees: public counts and a few well-rated teas."""
    return PublicSummary(
        **await home_service.public_counts(db),
        featured=[tea_summary(tea, r) for tea, r in await home_service.featured(db)],
    )

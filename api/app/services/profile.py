import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.household import HouseholdMember
from app.models.review import Review
from app.models.user import User
from app.schemas.auth import ProfileUpdate
from app.services.errors import NotFound

RECENT_REVIEW_LIMIT = 6


async def get_public(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = await db.get(User, user_id)
    # A deactivated account is indistinguishable from one that never existed. Saying
    # "this person left" is still telling a stranger that they were here.
    if user is None or not user.is_active:
        raise NotFound("user")
    return user


async def stats(db: AsyncSession, user_id: uuid.UUID) -> dict[str, object]:
    review_count = await db.scalar(
        select(func.count()).select_from(Review).where(Review.user_id == user_id)
    )
    average = await db.scalar(select(func.avg(Review.score)).where(Review.user_id == user_id))
    household_count = await db.scalar(
        select(func.count()).select_from(HouseholdMember).where(HouseholdMember.user_id == user_id)
    )
    return {
        "review_count": review_count or 0,
        # How generous a rater somebody is, which is the context you need to read their
        # 7 — a 7 from someone who averages 5 is not a 7 from someone who averages 9.
        "average_score_given": round(float(average), 1) if average is not None else None,
        "household_count": household_count or 0,
    }


async def recent_reviews(db: AsyncSession, user_id: uuid.UUID) -> list[Review]:
    rows = await db.scalars(
        select(Review)
        .options(selectinload(Review.tea))
        .where(Review.user_id == user_id)
        # id as a tiebreak, for the same reason every other list here has one: equal
        # timestamps must not reshuffle between requests.
        .order_by(Review.created_at.desc(), Review.id.desc())
        .limit(RECENT_REVIEW_LIMIT)
    )
    return list(rows)


async def update_own(db: AsyncSession, user: User, payload: ProfileUpdate) -> User:
    """exclude_unset, so PATCHing a bio does not blank a display name — while an
    explicit null still clears the field it names."""
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    await db.flush()
    fresh = await db.get(User, user.id)
    assert fresh is not None
    return fresh

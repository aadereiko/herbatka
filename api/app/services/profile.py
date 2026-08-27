import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.household import Household, HouseholdMember
from app.models.review import Review
from app.models.user import User
from app.schemas.auth import ProfileUpdate
from app.services.errors import NotFound
from app.services.friend import friend_ids_subquery

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


# --------------------------------------------------- what one person may see of another
#
# One rule, in one place, applied to both lists:
#
#   yourself   → everything
#   a friend   → everything
#   anyone else→ only the overlap: households you are both in, friends you have in common
#   signed out → nothing
#
# The overlap is always visible because it is already visible elsewhere: you can see a
# shared household on its own page, and a mutual friend on your own friends list. Hiding
# it here would not protect anything, it would just make the profile lie.
#
# Friendship widening this is a deliberate loosening of M3's rule that household
# membership is invisible to non-members. A friend learns the *name* of a household you
# are in — not its members, not its stock, and the household page still 404s for them.


async def _household_ids_of(db: AsyncSession, user_id: uuid.UUID) -> set[uuid.UUID]:
    rows = await db.scalars(
        select(HouseholdMember.household_id).where(HouseholdMember.user_id == user_id)
    )
    return set(rows)


async def visible_households(
    db: AsyncSession, viewer: User | None, person: User, *, are_friends: bool
) -> list[tuple[Household, bool]]:
    """Their households, paired with whether the viewer is in each one."""
    if viewer is None:
        return []

    theirs = await _household_ids_of(db, person.id)
    if not theirs:
        return []

    mine = await _household_ids_of(db, viewer.id)
    shared = theirs & mine
    visible = theirs if (are_friends or viewer.id == person.id) else shared
    if not visible:
        return []

    rows = await db.scalars(
        select(Household).where(Household.id.in_(visible)).order_by(Household.name)
    )
    return [(household, household.id in mine) for household in rows]


async def visible_friends(
    db: AsyncSession, viewer: User | None, person: User, *, are_friends: bool
) -> list[User]:
    """Their friends — all of them to a friend or to themselves, otherwise only the
    people you both know."""
    if viewer is None:
        return []

    theirs = set(await db.scalars(select(friend_ids_subquery(person.id).c.friend_id)))
    if not theirs:
        return []

    if not (are_friends or viewer.id == person.id):
        mine = set(await db.scalars(select(friend_ids_subquery(viewer.id).c.friend_id)))
        theirs &= mine

    # The list never contains the person reading it. On a friend's profile you would
    # otherwise find yourself among their friends, which the page has already told you
    # in the friend badge — it is noise, and on a mutuals list it is nonsense.
    theirs.discard(viewer.id)

    if not theirs:
        return []

    rows = await db.scalars(
        select(User)
        .where(User.id.in_(theirs), User.is_active.is_(True))
        .order_by(User.display_name)
    )
    return list(rows)

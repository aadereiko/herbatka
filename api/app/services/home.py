import math
import uuid
from datetime import UTC, datetime

from sqlalchemy import desc, func, nullslast, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.catalog import Ingredient, Tea
from app.models.friendship import Friendship
from app.models.household import Household, HouseholdMember, StockItem
from app.models.review import Review
from app.models.shop import Shop
from app.services import consumption as consumption_service
from app.services.catalog import TeaRatings, _ratings_from_row, _with_ratings

LOW_STOCK_LIMIT = 6

#: A tin forecast to empty within this many days joins the warning list even if it is
#: still above its own threshold. Two weeks is about the time it takes to notice, decide
#: and receive an order.
SOON_DAYS = 14
UNRATED_LIMIT = 4
ACTIVITY_LIMIT = 5


def _my_household_ids(user_id: uuid.UUID):
    return (
        select(HouseholdMember.household_id)
        .where(HouseholdMember.user_id == user_id)
        .scalar_subquery()
    )


async def low_tins(
    db: AsyncSession, user_id: uuid.UUID
) -> list[tuple[StockItem, Household, object | None]]:
    """Tins worth reordering, across every shelf you share, and why.

    Two sources, unioned, because on their own each misses the thing the other catches:

      **Below its own threshold.** A column-to-column comparison, since each tin carries
      its own number — 10 g of matcha is a fortnight, 10 g of herbal is one pot. This is
      the original rule and it still fires first.

      **Forecast to empty within `SOON_DAYS`.** The threshold is a number somebody had to
      set by hand, per tin, in advance — so in practice it is whatever the form defaulted
      to. The ledger already knows the actual answer: 40 g is three weeks of the daily
      sencha and a year of the lapsang opened once. This catches the sencha while there
      is still time to order more, which is the entire point of the warning.

    A tin that trips both appears once. Sorted by time-to-empty with the unforecastable
    last: a tin the ledger cannot read yet is a genuine unknown, and putting it above a
    tin known to have four days left would be ordering by ignorance.
    """
    mine = _my_household_ids(user_id)
    loads = (
        selectinload(StockItem.tea),
        selectinload(StockItem.household),
        selectinload(StockItem.shop),
    )

    below = list(
        await db.scalars(
            select(StockItem)
            .options(*loads)
            .where(
                StockItem.household_id.in_(mine),
                StockItem.quantity_grams <= StockItem.low_stock_grams,
            )
            .order_by(StockItem.quantity_grams)
            .limit(LOW_STOCK_LIMIT)
        )
    )

    # Ids only for the forecast pass, then full rows for the few that survive it. The
    # batch pace query returns only tins with outflow inside the window, so this is
    # bounded by how much tea the household actually drinks rather than by how many tins
    # it owns.
    candidate_ids = list(
        await db.scalars(
            select(StockItem.id).where(
                StockItem.household_id.in_(mine), StockItem.quantity_grams > 0
            )
        )
    )
    outflow = await consumption_service.pace_for_items(db, candidate_ids)

    by_id = {item.id: item for item in below}
    soon_ids = [i for i in outflow if i not in by_id]
    if soon_ids:
        for item in await db.scalars(
            select(StockItem).options(*loads).where(StockItem.id.in_(soon_ids))
        ):
            by_id.setdefault(item.id, item)

    now = datetime.now(UTC)
    scored: list[tuple[StockItem, Household, object | None]] = []
    for item in by_id.values():
        grams, events, first_at = outflow.get(item.id, (0.0, 0, None))
        pace = consumption_service.compute_pace(
            grams_out=grams,
            events=events,
            first_at=first_at,
            quantity_grams=float(item.quantity_grams),
            now=now,
        )
        days = pace.days_remaining if pace else None
        is_below = item.quantity_grams <= item.low_stock_grams
        if is_below or (days is not None and days <= SOON_DAYS):
            scored.append((item, item.household, pace))

    def urgency(row: tuple[StockItem, Household, object | None]) -> float:
        """Soonest-empty first; anything unforecastable last.

        Written as an explicit None check rather than `days_remaining or inf`, because
        `0 or inf` is `inf` — and a tin with nought days left is the single most urgent
        row on the page, not the least. An empty tin scores 0 for the same reason: it has
        already run out, whatever the ledger can or cannot say about its pace.
        """
        item, _, pace = row
        if item.quantity_grams <= 0:
            return 0.0
        days = getattr(pace, "days_remaining", None)
        return math.inf if days is None else float(days)

    scored.sort(key=urgency)
    return scored[:LOW_STOCK_LIMIT]


async def unrated_on_your_shelves(
    db: AsyncSession, user_id: uuid.UUID
) -> list[tuple[Tea, TeaRatings]]:
    """Teas you own but have never rated — the most obvious thing you could do next."""
    mine = select(Review.tea_id).where(Review.user_id == user_id).scalar_subquery()
    base = (
        select(Tea)
        .where(
            Tea.id.in_(
                select(StockItem.tea_id).where(
                    StockItem.household_id.in_(_my_household_ids(user_id)),
                    StockItem.quantity_grams > 0,
                )
            ),
            Tea.id.not_in(mine),
        )
        .order_by(Tea.name)
        .limit(UNRATED_LIMIT)
    )
    from app.services.catalog import _TEA_LOADS

    rows = await db.execute(_with_ratings(base.options(*_TEA_LOADS), user_id))
    return [(row[0], _ratings_from_row(row)) for row in rows.unique().all()]


async def counts(db: AsyncSession, user_id: uuid.UUID) -> dict[str, int]:
    household_count = await db.scalar(
        select(func.count()).select_from(HouseholdMember).where(HouseholdMember.user_id == user_id)
    )
    tin_count = await db.scalar(
        select(func.count())
        .select_from(StockItem)
        .where(StockItem.household_id.in_(_my_household_ids(user_id)))
    )
    friend_count = await db.scalar(
        select(func.count())
        .select_from(Friendship)
        .where(
            Friendship.status == "accepted",
            or_(Friendship.user_a_id == user_id, Friendship.user_b_id == user_id),
        )
    )
    pending = await db.scalar(
        select(func.count())
        .select_from(Friendship)
        .where(
            Friendship.status == "pending",
            Friendship.requested_by_id != user_id,
            or_(Friendship.user_a_id == user_id, Friendship.user_b_id == user_id),
        )
    )
    review_count = await db.scalar(
        select(func.count()).select_from(Review).where(Review.user_id == user_id)
    )
    return {
        "household_count": household_count or 0,
        "tin_count": tin_count or 0,
        "friend_count": friend_count or 0,
        "pending_requests": pending or 0,
        "review_count": review_count or 0,
    }


async def public_counts(db: AsyncSession) -> dict[str, int]:
    return {
        "tea_count": await db.scalar(
            select(func.count()).select_from(Tea).where(Tea.is_approved.is_(True))
        )
        or 0,
        "shop_count": await db.scalar(
            select(func.count()).select_from(Shop).where(Shop.is_approved.is_(True))
        )
        or 0,
        "ingredient_count": await db.scalar(select(func.count()).select_from(Ingredient)) or 0,
    }


async def featured(db: AsyncSession, limit: int = 6) -> list[tuple[Tea, TeaRatings]]:
    """The best-rated teas, for a signed-out visitor to look at.

    Ordered by average score with the unrated last, so the shop window is not a
    list of things nobody has an opinion about.
    """
    from app.services.catalog import _TEA_LOADS

    base = select(Tea).where(Tea.is_approved.is_(True)).options(*_TEA_LOADS)
    # Ordered by the aggregate column _with_ratings attaches, referenced by its label.
    # nullslast keeps unrated teas out of the shop window rather than at the top of it.
    rows = await db.execute(
        _with_ratings(base, None).order_by(nullslast(desc("avg_score")), Tea.name).limit(limit)
    )
    return [(row[0], _ratings_from_row(row)) for row in rows.unique().all()]

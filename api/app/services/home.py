import uuid

from sqlalchemy import desc, func, nullslast, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.catalog import Ingredient, Tea
from app.models.friendship import Friendship
from app.models.household import Household, HouseholdMember, StockItem
from app.models.review import Review
from app.models.shop import Shop
from app.services.catalog import TeaRatings, _ratings_from_row, _with_ratings

LOW_STOCK_LIMIT = 6
UNRATED_LIMIT = 4
ACTIVITY_LIMIT = 5


def _my_household_ids(user_id: uuid.UUID):
    return (
        select(HouseholdMember.household_id)
        .where(HouseholdMember.user_id == user_id)
        .scalar_subquery()
    )


async def low_tins(db: AsyncSession, user_id: uuid.UUID) -> list[tuple[StockItem, Household]]:
    """Tins below their own threshold, across every shelf you share.

    Each tin carries its own threshold, so this is a column-to-column comparison —
    10 g of matcha is a fortnight, 10 g of herbal is one pot.
    """
    rows = await db.scalars(
        select(StockItem)
        .options(
            selectinload(StockItem.tea),
            selectinload(StockItem.household),
            selectinload(StockItem.shop),
        )
        .where(
            StockItem.household_id.in_(_my_household_ids(user_id)),
            StockItem.quantity_grams <= StockItem.low_stock_grams,
        )
        .order_by(StockItem.quantity_grams)
        .limit(LOW_STOCK_LIMIT)
    )
    return [(row, row.household) for row in rows]


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

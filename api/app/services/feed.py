import uuid
from typing import Any

from sqlalchemy import func, literal, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.household import HouseholdMember, StockItem
from app.models.review import Review
from app.services.friend import friend_ids_subquery


def _sources(me: uuid.UUID):
    """The two things that show up in a feed, reduced to (kind, at, id).

    A friend's *reviews* are public information anyway. A friend's *stock* is not: it
    belongs to their household, and M3 goes to some trouble to keep household contents
    invisible to non-members. So the second source is tins added in households the
    viewer belongs to — activity they can already see — not tins their friends bought.
    """
    friends = friend_ids_subquery(me)
    my_households = (
        select(HouseholdMember.household_id).where(HouseholdMember.user_id == me).scalar_subquery()
    )

    reviews = select(
        literal("review").label("kind"),
        Review.created_at.label("at"),
        Review.id.label("ref_id"),
    ).where(Review.user_id.in_(select(friends.c.friend_id)))

    stocked = select(
        literal("stocked").label("kind"),
        StockItem.created_at.label("at"),
        StockItem.id.label("ref_id"),
    ).where(StockItem.household_id.in_(my_households))

    return reviews, stocked


async def page(
    db: AsyncSession, me: uuid.UUID, *, page: int = 1, size: int = 20
) -> tuple[list[dict[str, Any]], int]:
    """One ordered, paginated timeline across both sources.

    UNION ALL of (kind, at, id) first, then load the referenced rows — rather than
    fetching N of each and merging in Python, which silently goes wrong past the first
    page. The ordering carries `ref_id` as a tiebreak for the same reason the review
    list does: equal timestamps must not reshuffle between requests.
    """
    reviews, stocked = _sources(me)
    combined = union_all(reviews, stocked).subquery()

    total = await db.scalar(select(func.count()).select_from(combined)) or 0

    rows = (
        await db.execute(
            select(combined.c.kind, combined.c.at, combined.c.ref_id)
            .order_by(combined.c.at.desc(), combined.c.ref_id.desc())
            .offset((page - 1) * size)
            .limit(size)
        )
    ).all()
    if not rows:
        return [], total

    review_ids = [r.ref_id for r in rows if r.kind == "review"]
    stocked_ids = [r.ref_id for r in rows if r.kind == "stocked"]

    # Two batched lookups for the whole page, not one per row.
    reviews_by_id = (
        {
            r.id: r
            for r in await db.scalars(
                select(Review)
                .options(selectinload(Review.user), selectinload(Review.tea))
                .where(Review.id.in_(review_ids))
            )
        }
        if review_ids
        else {}
    )
    stock_by_id = (
        {
            s.id: s
            for s in await db.scalars(
                select(StockItem)
                .options(
                    selectinload(StockItem.tea),
                    selectinload(StockItem.household),
                    selectinload(StockItem.added_by),
                )
                .where(StockItem.id.in_(stocked_ids))
            )
        }
        if stocked_ids
        else {}
    )

    items: list[dict[str, Any]] = []
    for row in rows:
        if row.kind == "review":
            review = reviews_by_id.get(row.ref_id)
            if review is not None:
                items.append({"kind": "review", "row": review})
        else:
            tin = stock_by_id.get(row.ref_id)
            if tin is not None:
                items.append({"kind": "stocked", "row": tin})
    return items, total
